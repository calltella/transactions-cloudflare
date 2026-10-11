"use server";

import { revalidatePath } from "next/cache";
import { getUserDatabase } from "@/src/lib/db/user";

export async function saveCreditCard(form: FormData): Promise<{ success: boolean; message: string }> {
  const integer = (key: string, nullable = false): number | null => {
    const raw = form.get(key);
    if (nullable && raw === "") return null;
    if (typeof raw !== "string" || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error("invalid");
    return Number(raw);
  };
  let values;
  try {
    const payment_method_id = integer("payment_method_id")!;
    const closing_day = integer("closing_day", true);
    const payment_day = integer("payment_day", true);
    const payment_month_offset = integer("payment_month_offset")!;
    const bank_account_payment_method_id = integer("bank_account_payment_method_id", true);
    const memo = form.get("memo");
    if (payment_method_id < 1 || (bank_account_payment_method_id !== null && bank_account_payment_method_id < 1)
      || [closing_day, payment_day].some(day => day !== null && day > 31)
      || payment_month_offset > 32767 || typeof memo !== "string" || memo.length > 5000) throw new Error("invalid");
    values = { payment_method_id, closing_day, payment_day, payment_month_offset,
      bank_account_payment_method_id, is_active: form.get("is_active") === "on", memo: memo || null };
  } catch {
    return { success: false, message: "入力内容を確認してください。日付は0〜31、支払月は0以上で指定してください。" };
  }
  try {
    const { supabase, user } = await getUserDatabase();
    const ids = [values.payment_method_id, ...(values.bank_account_payment_method_id === null ? [] : [values.bank_account_payment_method_id])];
    const { data: methods, error: lookupError } = await supabase.from("payment_methods").select("id,type").in("id", ids);
    if (lookupError || !methods?.some(m => m.id === values.payment_method_id && m.type === "credit_card")
      || (values.bank_account_payment_method_id !== null && !methods.some(m => m.id === values.bank_account_payment_method_id && m.type === "bank_account"))) {
      return { success: false, message: "カードまたは引き落とし口座の選択を確認してください。" };
    }
    const { data, error } = await supabase.from("credit_cards")
      .upsert({ ...values, user_id: user.id }, { onConflict: "user_id,payment_method_id" }).select("id").single();
    if (error || !data) {
      console.error("save_credit_card failed", { code: error?.code });
      return { success: false, message: "保存できませんでした。credit_cardsテーブルとRLSの設定を確認してください。" };
    }
    revalidatePath("/cards");
    return { success: true, message: "カード設定を保存しました。" };
  } catch {
    return { success: false, message: "保存できませんでした。ログイン状態と接続を確認してください。" };
  }
}
