// Tests both installers in disposable databases on the development Supabase cluster.
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';

const root = new URL('../', import.meta.url);
const env = parseEnv(await readFile(new URL('.env.development.local', root), 'utf8'));
const url = new URL(env.DATABASE_URL);
assert.ok(['supabase-db', 'localhost', '127.0.0.1', 'host.docker.internal'].includes(url.hostname), 'Use only the development database');
const adminClient = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
await adminClient.connect();
try {
  const { rows: [uid] } = await adminClient.query("select pg_get_functiondef('auth.uid()'::regprocedure) as definition");
  for (const environment of ['local', 'production']) {
    const database = `setup_verify_${randomUUID().replaceAll('-', '')}`;
    const databaseUrl = new URL(url); databaseUrl.pathname = `/${database}`;
    let client;
    await adminClient.query(`create database "${database}" template template0`);
    try {
      client = new pg.Client({ connectionString: databaseUrl.href, connectionTimeoutMillis: 5000 });
      await client.connect();
      // Supabase's platform schema is a prerequisite; application tables start empty.
      await client.query(`create schema auth; create table auth.users(id uuid primary key, raw_app_meta_data jsonb default '{}'::jsonb, raw_user_meta_data jsonb default '{}'::jsonb); ${uid.definition};
        grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`);
      const setup = await readFile(new URL(`supabase/${environment}/setup.sql`, root), 'utf8');
      await client.query(setup);
      const actor = randomUUID();
      const other = randomUUID();
      await client.query(`insert into auth.users(id, raw_app_meta_data, raw_user_meta_data) values ($1, '{"role":"admin"}', '{}'),($2, '{}', '{"role":"admin"}')`, [actor, other]);
      await client.query('begin');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
      await client.query('set local role authenticated');
      await client.query(`insert into public.transactions_work(date,type,payment_method,parent_category,child_category,amount)
        values ('2026-10-14','支出','テスト銀行1','生活','食費',100), ('2026-10-14','収入','テスト銀行2',null,null,200)`);
      for (const fn of ['normalize_transaction_types', 'normalize_payment_methods', 'normalize_categories']) await client.query(`select public.${fn}()`);
      const imported = await client.query('select public.insert_normalized_transactions() as result');
      assert.equal(imported.rows[0].result.insertedCount, 2);
      const { rows: methods } = await client.query("select id from public.payment_methods order by name");
      const { rows: banks } = await client.query('insert into public.bank_accounts(payment_method_id) values ($1),($2) returning id', [methods[0].id, methods[1].id]);
      const cardMethod = await client.query("select id from public.payment_methods limit 1");
      await client.query('insert into public.credit_cards(payment_method_id,closing_day,payment_day) values ($1,15,10)', [cardMethod.rows[0].id]);
      await client.query('insert into public.dashboard_settings(month_start_holiday_adjustment) values ($1)', ['previous']);
      const { rows: [transfer] } = await client.query("select public.create_bank_transfer($1,$2,'2026-10-14',500,'test') as id", [banks[0].id, banks[1].id]);
      const { rows: transfers } = await client.query('select id from public.transactions where transfer_id=$1', [transfer.id]);
      assert.equal(transfers.length, 2);
      await client.query('select public.delete_bank_transfer($1,$2)', [transfers[0].id, banks[0].id]);
      assert.equal((await client.query('select count(*)::int as count from public.transactions')).rows[0].count, 2);
      await client.query("select public.reorder_accounts('bank',$1::bigint[])", [[banks[1].id,banks[0].id]]);
      assert.deepEqual((await client.query('select id from public.bank_accounts order by sort_order,id')).rows.map(row=>row.id),[banks[1].id,banks[0].id]);
      const { rows: cardIds } = await client.query('select id from public.credit_cards');
      await client.query("select public.reorder_accounts('card',$1::bigint[])", [cardIds.map(row=>row.id)]);
      await client.query("insert into public.bank_monthly_balances(bank_account_id,month,opening_amount,carryover_amount) values ($1,'2026-10-01',500,1000)",[banks[0].id]);
      await client.query('commit');
      // Installation can be repeated after real data exists without clearing it.
      await client.query(setup);
      assert.equal((await client.query('select count(*)::int as count from public.transactions')).rows[0].count, 2);
      assert.equal((await client.query('select count(*)::int as count from public.transactions_work')).rows[0].count, 2);
      assert.equal((await client.query('select count(*)::int as count from public.bank_accounts')).rows[0].count, 2);
      assert.equal((await client.query('select count(*)::int as count from public.credit_cards')).rows[0].count, 1);
      await client.query('begin');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [other]);
      await client.query('set local role authenticated');
      for (const table of ['transactions', 'transactions_work', 'bank_accounts', 'credit_cards', 'dashboard_settings', 'bank_monthly_balances']) {
        assert.equal((await client.query(`select count(*)::int as count from public.${table}`)).rows[0].count, 0);
      }
      for (const fn of ['normalize_transaction_types', 'normalize_payment_methods', 'normalize_categories', 'insert_normalized_transactions']) {
        await client.query('savepoint denied');
        await assert.rejects(client.query(`select public.${fn}()`), error => error.code === '42501');
        await client.query('rollback to denied');
      }
      await client.query('savepoint denied_monthly_balance');
      await assert.rejects(client.query("insert into public.bank_monthly_balances(bank_account_id,month,carryover_amount) values ($1,'2026-10-01',1000)",[banks[0].id]),error=>error.code==='23503');
      await client.query('rollback to denied_monthly_balance');
      await client.query('savepoint denied_order');
      await assert.rejects(client.query("select public.reorder_accounts('bank',$1::bigint[])", [[banks[0].id]]),error=>error.code==='42501');
      await client.query('rollback to denied_order');
      await client.query('savepoint duplicate_order');
      await assert.rejects(client.query("select public.reorder_accounts('bank',$1::bigint[])", [[banks[0].id,banks[0].id]]),error=>error.code==='22023');
      await client.query('rollback to duplicate_order');
      // Ordinary users can create an account, but cannot overwrite their existing account.
      const { rows: [createdBank] } = await client.query("select public.create_bank_account('新規銀行口座','銀行','支店','名義',1000,'2026-10-14',true,'test') as id");
      const { rows: [ownedBank] } = await client.query('select user_id,opening_balance from public.bank_accounts where id=$1',[createdBank.id]);
      assert.equal(ownedBank.user_id, other); assert.equal(Number(ownedBank.opening_balance),1000);
      await client.query('savepoint duplicate');
      await assert.rejects(client.query("select public.create_bank_account('新規銀行口座','','','',null,null,true,'')"),error=>error.code==='23505');
      await client.query('rollback to duplicate');
      await client.query('savepoint invalid_bank');
      await assert.rejects(client.query("select public.create_bank_account('不正口座','','','',1000,null,true,'')"),error=>error.code==='22023');
      await client.query('rollback to invalid_bank');
      assert.equal((await client.query("select count(*)::int as count from public.payment_methods where name='不正口座'")).rows[0].count,0);
      await client.query('rollback');
      // Revocation takes effect even if an older JWT still claims administrator.
      await client.query("update auth.users set raw_app_meta_data = '{}'::jsonb where id=$1", [actor]);
      await client.query('begin');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
      await client.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({sub:actor,app_metadata:{role:'admin'}})]);
      await client.query('set local role authenticated');
      assert.equal((await client.query('select private.is_admin() as allowed')).rows[0].allowed, false);
      await assert.rejects(client.query('select public.normalize_categories()'), error => error.code === '42501');
      await client.query('rollback');
      const { rows: tables } = await client.query("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r'");
      assert.equal(tables.length, 10); assert.ok(tables.every(table => table.relrowsecurity));
      const { rows: permissions } = await client.query("select has_function_privilege('anon','public.create_bank_transfer(bigint,bigint,date,integer,text)','execute') as allowed");
      assert.equal(permissions[0].allowed, false);
      console.log(`${environment}: fresh installation, CSV normalization/import, cards/settings, bank transfers, repeat installation and owner/admin access passed`);
    } finally {
      if (client) await client.end();
      await adminClient.query(`drop database "${database}"`);
    }
  }
} finally { await adminClient.end(); }
