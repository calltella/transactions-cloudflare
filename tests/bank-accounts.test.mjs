import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./module-loader.mjs";

function form(overrides = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ payment_method_id: "5", bank_name: "銀行", branch_name: "支店", account_holder: "名義", opening_balance: "-100", opening_balance_date: "2026-10-11", is_active: "on", memo: "メモ", ...overrides })) result.set(key, value);
  return result;
}

test("bank account save assigns verified ownership and preserves negative balance", async () => {
  let saved;
  let refreshed = false;
  const module = await loadModule("app/bank-accounts/actions.ts", {
    "next/cache": { revalidatePath: path => { assert.equal(path, "/bank-accounts"); refreshed = true; } },
    "@/src/lib/db/user": { getUserDatabase: async () => ({ user: { id: "verified" }, supabase: {
      from: table => table === "payment_methods" ? { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 5, type: "bank_account" }, error: null }) }) }) }) }
        : { upsert: (values, options) => { saved = values; assert.equal(options.onConflict, "user_id,payment_method_id"); return { select: () => ({ single: async () => ({ data: { id: 1 }, error: null }) }) }; } },
    } }) },
  });
  assert.equal((await module.saveBankAccount(form({ user_id: "forged", id: "99" }))).success, true);
  assert.equal(saved.user_id, "verified");
  assert.equal(saved.opening_balance, -100);
  assert.equal(saved.id, undefined);
  assert.equal(refreshed, true);
});


for (const overrides of [{ opening_balance: "1.2" }, { opening_balance_date: "2026-02-30" }, { opening_balance: "" }, { opening_balance_date: "" }, { payment_method_id: "0" }]) {
  test(`bank account save rejects invalid input ${JSON.stringify(overrides)}`, async () => {
    const module = await loadModule("app/bank-accounts/actions.ts", {
      "next/cache": { revalidatePath: () => assert.fail() },
      "@/src/lib/db/user": { getUserDatabase: () => assert.fail("Invalid input must not reach DB") },
    });
    assert.equal((await module.saveBankAccount(form(overrides))).success, false);
  });
}

test('bank account creation validates a name and saves through atomic RPC without client ownership', async () => {
 let args;
 const module = await loadModule('app/bank-accounts/actions.ts', {
  'next/cache': {revalidatePath:()=>{}},
  '@/src/lib/db/user': {getUserDatabase:async()=>({user:{id:'verified'},supabase:{rpc:async(name,values)=>{assert.equal(name,'create_bank_account');args=values;return {data:10,error:null}}}})}
 });
 assert.equal((await module.createBankAccount(form({account_name:'   '}))).success,false);
 assert.equal(args,undefined);
 assert.equal((await module.createBankAccount(form({account_name:'  生活費口座  ',user_id:'forged'}))).accountId,10);
 assert.equal(args.account_name,'生活費口座');assert.equal(args.user_id,undefined);assert.equal(args.opening_balance,-100);
});
test('bank account creation reports duplicate names without modifying existing accounts', async () => {
 const module=await loadModule('app/bank-accounts/actions.ts',{
  'next/cache': {revalidatePath:()=>assert.fail()},
  '@/src/lib/db/user': {getUserDatabase:async()=>({supabase:{rpc:async()=>({data:null,error:{code:'23505'}})}})}
 });
 const result=await module.createBankAccount(form({account_name:'生活費口座'}));
 assert.equal(result.success,false);assert.match(result.message,/既に登録/);
});
