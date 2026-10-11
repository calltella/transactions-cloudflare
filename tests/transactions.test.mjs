import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { loadModule } from "./module-loader.mjs";

const userId = "c34a94a8-fcb8-4ca8-a1ab-6f097059effd";
const validClaims = { sub: userId, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600,
  user_metadata: { name: "quote ' and unicode あ" } };

test("SDK context validates the exact JWT before trusting claims", async () => {
  const tokens = [];
  const supabase = { auth: {
    getSession: async () => ({ data: { session: { access_token: "user-jwt" } } }),
    getClaims: async (token) => { tokens.push(token); return { data: { claims: validClaims } }; },
    getUser: async (token) => { tokens.push(token); return { data: { user: { id: userId } } }; },
  } };
  const module = await loadModule("app/src/lib/db/user.ts", {
    "next/headers": { cookies: async () => ({}) },
    "@/utils/supabase/server": { createClient: () => supabase },
  });
  assert.equal((await module.getUserDatabase()).supabase, supabase);
  assert.deepEqual(tokens, ["user-jwt", "user-jwt"]);
});

for (const [name, claims, claimsError, actualId] of [
  ["unverified JWT", validClaims, new Error("signature")],
  ["service role", { ...validClaims, role: "service_role" }],
  ["expired JWT", { ...validClaims, exp: 1 }],
  ["missing expiry", { sub: userId, role: "authenticated" }],
  ["mismatched identity", validClaims, undefined, "different-user"],
]) {
  test(`SDK context rejects ${name}`, async () => {
    const module = await loadModule("app/src/lib/db/user.ts", {
      "next/headers": { cookies: async () => ({}) },
      "@/utils/supabase/server": { createClient: () => ({ auth: {
        getSession: async () => ({ data: { session: { access_token: "jwt" } } }),
        getClaims: async () => ({ data: { claims }, error: claimsError }),
        getUser: async () => ({ data: { user: { id: actualId ?? userId } } }),
      } }) },
    });
    await assert.rejects(module.getUserDatabase(), { name: "UserAuthenticationError" });
  });
}

async function transactionModule(authFailure = false, rlsReady = true) {
  const queries = [];
  let connections = 0;
  let closed = 0;
  class Client {
    async connect() { connections++; }
    async query(query, params) {
      queries.push({ text: typeof query === "string" ? query : query.text, params });
      if (queries.at(-1).text.includes("from pg_class")) return { rows: [{ rls_ready: rlsReady }] };
      return { rows: [], rowCount: 0 };
    }
    async end() { closed++; }
  }
  const module = await loadModule("app/src/lib/db/import-transaction.ts", {
    "cloudflare:workers": { env: { HYPERDRIVE: { connectionString: "local-test" } } },
    pg: { Client },
    "./user": { getUserDatabase: async () => {
      if (authFailure) throw new Error("unauthenticated");
      return { claims: validClaims, user: { id: userId } };
    } },
  });
  return { module, queries, connections: () => connections, closed: () => closed };
}

test("real Drizzle transaction binds verified claims, sets local role, commits and closes", async () => {
  const state = await transactionModule();
  const result = await state.module.withUserImportTransaction(async (tx, id) => {
    assert.equal(id, userId);
    await tx.execute(sql`select 1`);
    return 42;
  });
  assert.equal(result, 42);
  const text = state.queries.map((query) => query.text);
  assert.equal(text[0], "begin");
  assert.equal(text[1], "set local role authenticated");
  assert.ok(text[2].includes("set_config('request.jwt.claims', $1, true)"));
  assert.equal(state.queries[2].params[0], JSON.stringify(validClaims));
  assert.equal(state.queries[2].params[1], userId);
  assert.ok(!text[2].includes(validClaims.user_metadata.name));
  assert.equal(text[3], "set local row_security = on");
  assert.equal(text.at(-1), "commit");
  assert.equal(state.closed(), 1);
});

test("failed import rolls back and closes, without committing", async () => {
  const state = await transactionModule();
  await assert.rejects(state.module.withUserImportTransaction(async () => { throw new Error("insert failed"); }), /insert failed/);
  const text = state.queries.map((query) => query.text);
  assert.equal(text.at(-1), "rollback");
  assert.ok(!text.includes("commit"));
  assert.equal(state.closed(), 1);
});

test("authentication failure never opens a direct DB connection", async () => {
  const state = await transactionModule(true);
  await assert.rejects(state.module.withUserImportTransaction(async () => assert.fail()), /unauthenticated/);
  assert.equal(state.connections(), 0);
  assert.equal(state.queries.length, 0);
});

test("disabled RLS prevents CSV writes and rolls back", async () => {
  const state = await transactionModule(false, false);
  let called = false;
  await assert.rejects(state.module.withUserImportTransaction(async () => { called = true; }), /RLS must be enabled/);
  assert.equal(called, false);
  assert.equal(state.queries.at(-1).text, "rollback");
  assert.equal(state.closed(), 1);
});

test("ordinary operations use the user SDK and cannot change ownership", async () => {
  const calls = [];
  const builder = { then: (resolve) => resolve({ data: { id: 1 }, count: 1, error: null }) };
  for (const method of ["select", "eq", "order", "gte", "lte", "ilike", "range", "maybeSingle", "update", "delete"]) {
    builder[method] = (...args) => { calls.push([method, ...args]); return builder; };
  }
  const module = await loadModule("app/src/lib/db/transactions.ts", {
    "./user": { getUserDatabase: async () => ({ user: { id: userId }, supabase: {
      from: (table) => { assert.equal(table, "transactions_work"); return builder; },
    } }) },
  });
  await module.listTransactions({ memo: "100%", limit: 20 });
  await module.getTransaction(1);
  await module.updateTransaction(1, { memo: "updated" });
  await module.deleteTransaction(1);
  assert.equal(calls.filter((call) => call[0] === "eq" && call[1] === "user_id" && call[2] === userId).length, 4);
  assert.ok(calls.some((call) => call[0] === "ilike" && call[2] === "%100\\%%"));
  await assert.rejects(module.updateTransaction(1, { user_id: "someone-else" }), /Invalid transaction fields/);
});

test("CSV supports BOM, CRLF, quoted commas/newlines, escaped quotes and null amounts", async () => {
  const { parseTransactionCsv } = await loadModule("app/src/lib/db/csv.ts", {});
  const rows = parseTransactionCsv('\uFEFFdate,type,amount,memo\r\n2026-10-11,expense,-120,"a,b\n""quoted"""\r\n2026-10-12,income,,\r\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].memo, 'a,b\n"quoted"');
  assert.equal(rows[0].amount, -120);
  assert.equal(rows[1].amount, null);
  assert.equal(rows[1].memo, null);
});

test("record.csv Japanese headers map every column and discard time without changing the day", async () => {
  const { parseTransactionCsv } = await loadModule("app/src/lib/db/csv.ts", {});
  const rows = parseTransactionCsv("日付,収入/支出,入金/支払方法,親カテゴリ,子カテゴリ,金額,場所,メモ,備考,タグ\n2024/02/29 23:59,支出,現金,食費,昼食,1200,店,メモ,備考,タグ\n2026/10/11 00:00,収入,,,,100,,,,");
  assert.deepEqual(JSON.parse(JSON.stringify(rows[0])), {
    date: "2024-02-29", type: "支出", payment_method: "現金", parent_category: "食費",
    child_category: "昼食", amount: 1200, location: "店", memo: "メモ", note: "備考", tag: "タグ",
  });
  assert.equal(rows[1].date, "2026-10-11");
  assert.equal(rows[1].type, "収入");
  assert.equal(rows[1].child_category, null);
});

test("date normalization rejects invalid calendar dates, times and duplicate column aliases", async () => {
  const { parseTransactionCsv } = await loadModule("app/src/lib/db/csv.ts", {});
  for (const value of ["2023/02/29 12:00", "2026/10/11 24:00", "2026/10/11 12:60", "2026/10-11 00:00", "0000/01/01"]) {
    assert.throws(() => parseTransactionCsv(`日付,収入/支出\n${value},支出`), { name: "CsvValidationError" });
  }
  assert.throws(() => parseTransactionCsv("日付,date,収入/支出\n2026/10/11,2026-10-11,支出"), { name: "CsvValidationError" });
  assert.equal(parseTransactionCsv("日付,type\n2026/10/11,expense")[0].date, "2026-10-11");
});

test("CSV rejects ownership injection, invalid dates, nonintegers and malformed quotes", async () => {
  const { parseTransactionCsv } = await loadModule("app/src/lib/db/csv.ts", {});
  for (const csv of [
    `date,type,user_id\n2026-10-11,expense,${userId}`,
    "date,type,id\n2026-10-11,expense,1",
    "date,type,date\n2026-10-11,expense,2026-10-11",
    "date,type\n2026-02-30,expense",
    "date,type,amount\n2026-10-11,expense,1.5",
    "date,type,amount\n2026-10-11,expense,2147483648",
    'date,type\n2026-10-11,"expense',
    'date,type\n2026-10-11,"expense"oops',
    "date,type\n2026-10-11,",
  ]) assert.throws(() => parseTransactionCsv(csv), { name: "CsvValidationError" });
  assert.throws(() => parseTransactionCsv("date,type\n" + "2026-10-11,expense\n".repeat(5001)), /5000/);
});

test("CSV importer supplies only verified ownership and splits writes in one transaction", async () => {
  let transactions = 0;
  const batches = [];
  const operations = [];
  const ownerColumn = {};
  const module = await loadModule("app/src/lib/db/import-transactions.ts", {
    "./import-transaction": { withUserImportTransaction: async (work) => {
      transactions++;
      return work({
        execute: async (query) => { operations.push("lock"); assert.equal(query.values[0], userId); },
        delete: () => ({ where: async (condition) => { operations.push("delete"); assert.equal(condition.column, ownerColumn); assert.equal(condition.value, userId); } }),
        insert: () => ({ values: async (batch) => { operations.push("insert"); batches.push(batch); } }),
      }, userId);
    } },
    "./schema": { transactionsWork: { userId: ownerColumn } },
    "drizzle-orm": { eq: (column, value) => ({ column, value }), sql: (strings, ...values) => ({ strings, values }) },
  });
  const result = await module.importTransactionsCsv("date,type\n" + "2026-10-11,expense\n".repeat(251));
  assert.equal(result.importedCount, 251);
  assert.equal(transactions, 1);
  assert.deepEqual(batches.map((batch) => batch.length), [250, 1]);
  assert.ok(batches.flat().every((row) => row.userId === userId));
  assert.deepEqual(operations, ["lock", "delete", "insert", "insert"]);
  await assert.rejects(module.importTransactionsCsv("date,type\ninvalid,expense"));
  assert.equal(transactions, 1, "Invalid CSV must not start deletion");
});

test("import API rejects cross-origin requests and accepts a same-origin file", async () => {
  let authenticated = 0;
  let imported = 0;
  const module = await loadModule("app/api/transactions/import/route.ts", {
    "@/src/lib/db/user": { getUserDatabase: async () => { authenticated++; }, UserAuthenticationError: class extends Error {} },
    "@/src/lib/db/import-transactions": { importTransactionsCsv: async (csv) => {
      assert.equal(csv, "date,type\n2026-10-11,expense");
      imported++;
      return { importedCount: 1 };
    } },
  });
  assert.equal((await module.POST(new Request("https://app.test/api/transactions/import", {
    method: "POST", headers: { Origin: "https://other.test" },
  }))).status, 403);
  assert.equal(authenticated, 0);
  const form = new FormData();
  form.set("file", new File(["date,type\n2026-10-11,expense"], "transactions.csv"));
  const result = await module.POST(new Request("https://app.test/api/transactions/import", {
    method: "POST", headers: { Origin: "https://app.test" }, body: form,
  }));
  assert.equal(result.status, 200);
  assert.equal(imported, 1);
  assert.equal(result.headers.get("Cache-Control"), "private, no-store");
});
