import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./module-loader.mjs";

for (const [code, expected] of [["PGRST202", /関数が登録されていません/], ["42501", /実行権限がありません/], ["23503", /既存の取引から参照.*全件削除できません/], ["P0001", /エラーコード: P0001/], ["25006", /エラーコード: 25006/]]) {
  test(`type normalization explains ${code}`, async () => {
    const module = await loadModule("app/developer/normalize-types-actions.ts", {
      "next/cache": { revalidatePath: () => assert.fail("Failed RPC should not revalidate") },
      "@/src/lib/auth/developer": { isDeveloper: () => true },
      "@/src/lib/db/user": { getUserDatabase: async () => ({ user: { id: "verified-user" }, supabase: {
        rpc: async () => ({ data: null, error: { code, message: "private database details" } }),
      } }) },
    });
    const result = await module.normalizeTransactionTypes();
    assert.equal(result.success, false);
    assert.match(result.message, expected);
    assert.ok(!result.message.includes("private"));
  });
}

for (const allowed of [true, false]) {
  test(`type normalization ${allowed ? "rebuilds using the user SDK RPC" : "rejects ordinary users before the RPC"}`, async () => {
    let calls = 0;
    const module = await loadModule("app/developer/normalize-types-actions.ts", {
      "next/cache": { revalidatePath: () => {} },
      "@/src/lib/auth/developer": { isDeveloper: () => allowed },
      "@/src/lib/db/user": { getUserDatabase: async () => ({ user: { id: "verified-user" }, supabase: {
        rpc: async (name, args) => {
          calls++;
          assert.equal(name, "normalize_transaction_types");
          assert.equal(Object.keys(args).length, 0);
          return { data: { deletedCount: 3, deletedTransactionsCount: 27, registeredCount: 2 }, error: null };
        },
      } }) },
    });
    const result = await module.normalizeTransactionTypes();
    assert.equal(result.success, allowed);
    assert.equal(calls, allowed ? 1 : 0);
    if (allowed) assert.match(result.message, /transactionsを27件.*transaction_typesを3件.*2種類/);
  });
}

test("type normalization reports RPC errors without exposing database details", async () => {
  const module = await loadModule("app/developer/normalize-types-actions.ts", {
    "next/cache": { revalidatePath: () => assert.fail("Failed RPC should not revalidate") },
    "@/src/lib/auth/developer": { isDeveloper: () => true },
    "@/src/lib/db/user": { getUserDatabase: async () => ({ user: { id: "verified-user" }, supabase: {
      rpc: async () => ({ data: null, error: { message: "private database details" } }),
    } }) },
  });
  const result = await module.normalizeTransactionTypes();
  assert.equal(result.success, false);
  assert.ok(!result.message.includes("private"));
});
