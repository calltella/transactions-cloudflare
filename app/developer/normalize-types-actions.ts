"use server";

import { revalidatePath } from "next/cache";
import { getUserDatabase } from "@/src/lib/db/user";
import { isDeveloper } from "@/src/lib/auth/developer";

export type NormalizeTypesResult = { success: boolean; message: string };

export async function normalizeTransactionTypes(): Promise<NormalizeTypesResult> {
  try {
    const { supabase, user } = await getUserDatabase();
    if (!isDeveloper(user)) return { success: false, message: "管理者のみ実行できます。" };
    const { data, error } = await supabase.rpc("normalize_transaction_types", {});
    if (error) {
      // Log only the error code; DB details can contain private record values.
      console.error("normalize_transaction_types RPC failed", { code: error.code });
      if (error.code === "PGRST202") {
        return { success: false, message: "接続先DBに正規化関数が登録されていません。環境に対応する正規化用SQLを適用してください。" };
      }
      if (error.code === "42501") {
        return { success: false, message: "正規化の実行権限がありません。接続先DBの管理者UUIDと権限設定を確認してください。" };
      }
      if (error.code === "23503") {
        return { success: false, message: "transaction_typesが既存の取引から参照されているため、全件削除できません。既存データは変更されていません。" };
      }
      const code = typeof error.code === "string" && /^[A-Z0-9]{5,12}$/.test(error.code)
        ? `（エラーコード: ${error.code}）` : "";
      return { success: false, message: `typeの正規化に失敗しました${code}。` };
    }
    if (!data) return { success: false, message: "正規化の実行結果を確認できませんでした。" };
    revalidatePath("/developer");
    return { success: true, message: `transactionsを${data.deletedTransactionsCount}件、transaction_typesを${data.deletedCount}件削除し、${data.registeredCount}種類を登録しました。` };
  } catch {
    return { success: false, message: "typeの正規化を実行できませんでした。ログイン状態と接続を確認してください。" };
  }
}
