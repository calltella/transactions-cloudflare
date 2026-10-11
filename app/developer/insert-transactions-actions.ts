"use server";

import { revalidatePath } from "next/cache";
import { getUserDatabase } from "@/src/lib/db/user";
import { isDeveloper } from "@/src/lib/auth/developer";

export type InsertTransactionsResult = { success: boolean; message: string };

export async function insertNormalizedTransactions(): Promise<InsertTransactionsResult> {
  try {
    const { supabase, user } = await getUserDatabase();
    if (!isDeveloper(user.id)) return { success: false, message: "開発者のみ実行できます。" };
    const { data, error } = await supabase.rpc("insert_normalized_transactions", {});
    if (error) {
      console.error("insert_normalized_transactions RPC failed", { code: error.code });
      if (error.code === "PGRST202") return { success: false, message: "登録用SQLを接続先DBに適用してください。" };
      if (error.code === "P0001") return { success: false, message: "正規化済みテーブルに対応する値がありません。type・支払方法・親子カテゴリの正規化を確認してください。登録は行っていません。" };
      if (error.code === "P0002") return { success: false, message: "あなたのtransactionsには既にデータがあります。二重登録を防ぐため登録を中止しました。" };
      const code = /^[A-Z0-9]{5,12}$/.test(error.code ?? "") ? `（エラーコード: ${error.code}）` : "";
      return { success: false, message: `transactionsへの登録に失敗しました${code}。` };
    }
    if (!data) return { success: false, message: "登録結果を確認できませんでした。" };
    revalidatePath("/developer");
    return { success: true, message: `transactionsに${data.insertedCount}件登録しました。` };
  } catch {
    return { success: false, message: "登録を実行できませんでした。ログイン状態と接続を確認してください。" };
  }
}
