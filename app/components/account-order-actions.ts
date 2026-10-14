"use server";
import { revalidatePath } from "next/cache";
import { getUserDatabase } from "@/src/lib/db/user";

export async function saveAccountOrder(kind: "bank" | "card", ids: number[]) {
  if (!["bank", "card"].includes(kind) || !Array.isArray(ids) || !ids.length || ids.length > 10000
    || ids.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) {
    return { success: false, message: "並び順を確認してください。" };
  }
  try {
    const { supabase } = await getUserDatabase();
    const { error } = await supabase.rpc("reorder_accounts", { account_kind: kind, account_ids: ids });
    if (error) return { success: false, message: "並び順を保存できませんでした。画面を更新して再度お試しください。" };
    revalidatePath("/"); revalidatePath("/bank-accounts", "layout"); revalidatePath("/cards"); revalidatePath("/cash", "layout");
    return { success: true, message: "並び順を保存しました。" };
  } catch { return { success: false, message: "並び順を保存できませんでした。ログイン状態を確認してください。" }; }
}
