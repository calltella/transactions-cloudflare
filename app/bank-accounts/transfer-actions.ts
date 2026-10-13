"use server";
import { revalidatePath } from "next/cache";
import { getUserDatabase } from "@/src/lib/db/user";

export async function createBankTransfer(form: FormData) {
  try {
    const id = (key: string) => { const value = form.get(key); if (typeof value !== "string" || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error("Invalid ID"); return Number(value); };
    const source = id("source_bank_id"), destination = id("destination_bank_id"), amount = id("amount");
    const date = form.get("date"), memo = form.get("memo");
    if (source === destination || amount > 2147483647 || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000") || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || typeof memo !== "string" || memo.length > 5000) throw new Error("Invalid transfer");
    const { supabase } = await getUserDatabase();
    const result = await supabase.rpc("create_bank_transfer", { source_bank_id: source, destination_bank_id: destination, transfer_date: date, transfer_amount: amount, transfer_memo: memo });
    if (result.error || !result.data) return { success: false, message: "振替を登録できませんでした。口座の設定と権限を確認してください。" };
    revalidatePath("/bank-accounts", "layout"); revalidatePath("/");
    return { success: true, message: "口座間振替を登録しました。" };
  } catch { return { success: false, message: "振替を登録できませんでした。入力内容とログイン状態を確認してください。" }; }
}
