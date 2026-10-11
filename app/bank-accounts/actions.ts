"use server";

import { revalidatePath } from "next/cache";
import { getUserDatabase } from "@/src/lib/db/user";

export async function saveBankAccount(form: FormData): Promise<{ success: boolean; message: string }> {
  let values;
  try {
    const text = (key: string, max: number) => {
      const value = form.get(key);
      if (typeof value !== "string" || value.length > max) throw new Error("invalid");
      return value.trim() || null;
    };
    const rawId = form.get("payment_method_id");
    if (typeof rawId !== "string" || !/^\d+$/.test(rawId)) throw new Error("invalid");
    const payment_method_id = Number(rawId);
    if (!Number.isSafeInteger(payment_method_id) || payment_method_id < 1) throw new Error("invalid");
    const balance = form.get("opening_balance");
    if (typeof balance !== "string" || (balance !== "" && !/^-?\d+$/.test(balance))) throw new Error("invalid");
    const opening_balance = balance === "" ? null : Number(balance);
    if (opening_balance !== null && !Number.isSafeInteger(opening_balance)) throw new Error("invalid");
    const opening_balance_date = text("opening_balance_date", 10);
    if ((opening_balance === null) !== (opening_balance_date === null)) throw new Error("invalid");
    if (opening_balance_date && (!/^\d{4}-\d{2}-\d{2}$/.test(opening_balance_date)
      || opening_balance_date.startsWith("0000")
      || !Number.isFinite(Date.parse(opening_balance_date))
      || new Date(opening_balance_date).toISOString().slice(0, 10) !== opening_balance_date)) throw new Error("invalid");
    values = { payment_method_id, bank_name: text("bank_name", 200), branch_name: text("branch_name", 200),
      account_holder: text("account_holder", 200), opening_balance, opening_balance_date,
      is_active: form.get("is_active") === "on", memo: text("memo", 5000) };
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
