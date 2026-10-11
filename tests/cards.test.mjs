import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./module-loader.mjs";

function form(overrides = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ payment_method_id: "5", closing_day: "0", payment_day: "27", payment_month_offset: "1", bank_account_payment_method_id: "9", is_active: "on", memo: "メモ", ...overrides })) result.set(key, value);
  return result;
}

test("card save assigns verified ownership and accepts month-end", async () => {
  let saved;
  let refreshed = false;
  const module = await loadModule("app/cards/actions.ts", {
    "next/cache": { revalidatePath: path => { assert.equal(path, "/cards"); refreshed = true; } },
    "@/src/lib/db/user": { getUserDatabase: async () => ({ user: { id: "verified" }, supabase: {
      from: table => table === "payment_methods" ? { select: () => ({ in: async () => ({ data: [{ id: 5, type: "credit_card" }, { id: 9, type: "bank_account" }], error: null }) }) }
        : { upsert: (values, options) => { saved = values; assert.equal(options.onConflict, "user_id,payment_method_id"); return { select: () => ({ single: async () => ({ data: { id: 1 }, error: null }) }) }; } },
    } }) },
  });
  assert.equal((await module.saveCreditCard(form({ user_id: "forged", id: "99" }))).success, true);
  assert.equal(saved.user_id, "verified");
  assert.equal(saved.closing_day, 0);
  assert.equal(saved.id, undefined);
  assert.equal(refreshed, true);
});

for (const overrides of [{ closing_day: "32" }, { payment_day: "-1" }, { payment_month_offset: "1.5" }, { payment_method_id: "" }]) {
  test(`card save rejects invalid fields ${JSON.stringify(overrides)}`, async () => {
    const module = await loadModule("app/cards/actions.ts", {
      "next/cache": { revalidatePath: () => assert.fail() },
      "@/src/lib/db/user": { getUserDatabase: () => assert.fail("Invalid inputs must not reach DB") },
    });
    assert.equal((await module.saveCreditCard(form(overrides))).success, false);
  });
}

test("card save rejects a card chosen as the bank account", async () => {
  const module = await loadModule("app/cards/actions.ts", {
    "next/cache": { revalidatePath: () => assert.fail() },
    "@/src/lib/db/user": { getUserDatabase: async () => ({ user: { id: "verified" }, supabase: {
      from: table => { assert.equal(table, "payment_methods"); return { select: () => ({ in: async () => ({ data: [{ id: 5, type: "credit_card" }, { id: 9, type: "credit_card" }], error: null }) }) }; },
    } }) },
  });
  assert.equal((await module.saveCreditCard(form())).success, false);
});
