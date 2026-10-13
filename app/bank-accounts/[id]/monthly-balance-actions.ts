"use server";
import { revalidatePath } from "next/cache";
import { getUserDatabase } from "@/src/lib/db/user";

export async function saveMonthlyBalance(form: FormData) {
  try {
    const integer = (key: string, fallback?: number) => {
      const raw = form.get(key);
      if (raw === "" && fallback !== undefined) return fallback;
      if (typeof raw !== "string" || !/^-?\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error("Invalid amount");
      return Number(raw);
    };
    const bankId = integer("bank_id"), opening = integer("opening_amount",0), carryover = integer("carryover_amount",0);
    const month = form.get("month");
    if (bankId < 1 || typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < "1956-01" || month > "9998-12") throw new Error("Invalid balance");
    const { supabase, user } = await getUserDatabase();
    const bank = await supabase.from("bank_accounts").select("id").eq("id",bankId).eq("user_id",user.id).maybeSingle();
    if (bank.error || !bank.data) return { success: false, message: "口座を取得できませんでした。" };
    const result = await supabase.from("bank_monthly_balances").upsert({ user_id: user.id, bank_account_id: bankId, month: `${month}-01`, opening_amount: opening, opening_override: form.get("opening_override") === "on", carryover_amount: carryover, updated_at: new Date().toISOString() }, { onConflict: "user_id,bank_account_id,month" }).select("bank_account_id").single();
    if (result.error || !result.data) return { success: false, message: "月初金額・繰越金を保存できませんでした。" };
    revalidatePath(`/bank-accounts/${bankId}`); revalidatePath("/");
    return { success: true, message: "月初金額・繰越金を保存しました。" };
  } catch { return { success: false, message: "金額と対象月、ログイン状態を確認してください。" }; }
}
