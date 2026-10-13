"use server";

import { revalidatePath } from "next/cache";
import { bankAccountInput } from "@/src/lib/db/bank-account-input";
import { getUserDatabase } from "@/src/lib/db/user";

export async function saveBankAccount(form: FormData): Promise<{ success: boolean; message: string }> {
  let values;
  try {
    const rawId = form.get("payment_method_id");
    if (typeof rawId !== "string" || !/^\d+$/.test(rawId) || !Number.isSafeInteger(Number(rawId)) || Number(rawId) < 1) throw new Error("invalid");
    values = { payment_method_id: Number(rawId), ...bankAccountInput(form) };
  } catch {
    return { success: false, message: "入力内容を確認してください。開始残高は整数で、基準日とセットで入力してください。" };
  }
  try {
    const { supabase, user } = await getUserDatabase();
    const { data: method, error: lookupError } = await supabase.from("payment_methods").select("id,type")
      .eq("id", values.payment_method_id).eq("type", "bank_account").maybeSingle();
    if (lookupError || !method) return { success: false, message: "銀行口座の選択を確認してください。" };
    const { data, error } = await supabase.from("bank_accounts")
      .upsert({ ...values, user_id: user.id }, { onConflict: "user_id,payment_method_id" }).select("id").single();
    if (error || !data) {
      console.error("save_bank_account failed", { code: error?.code });
      return { success: false, message: "保存できませんでした。bank_accountsテーブルとRLSの設定を確認してください。" };
    }
    revalidatePath("/bank-accounts");
    return { success: true, message: "銀行口座設定を保存しました。" };
  } catch {
    return { success: false, message: "保存できませんでした。ログイン状態と接続を確認してください。" };
  }
}

export async function createBankAccount(form: FormData): Promise<{ success: boolean; message: string; accountId?: number }> {
  try {
    const name = form.get("account_name");
    if (typeof name !== "string" || !name.trim() || name.trim().length > 200) return { success: false, message: "口座名を200文字以内で入力してください。" };
    const values = bankAccountInput(form);
    const { supabase } = await getUserDatabase();
    const result = await supabase.rpc("create_bank_account", { account_name: name.trim(), ...values });
    if (result.error || !result.data) {
      const message = result.error?.code === "23505" ? "同じ口座名は既に登録されています。別の名前を指定してください。"
        : result.error?.code === "22023" ? "口座名が他の支払方法に使われているか、入力内容が不正です。"
        : "銀行口座を登録できませんでした。ログイン状態と接続を確認してください。";
      return { success: false, message };
    }
    revalidatePath("/bank-accounts", "layout"); revalidatePath("/");
    return { success: true, message: "銀行口座を登録しました。", accountId: result.data };
  } catch { return { success: false, message: "入力内容を確認してください。開始残高は整数で、基準日とセットで入力してください。" }; }
}
