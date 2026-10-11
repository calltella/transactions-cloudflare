"use server";
import { revalidatePath } from "next/cache";
import { getUserDatabase } from "@/src/lib/db/user";

const positiveId = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error("Invalid ID");
  return Number(value);
};

export async function mutateBankTransaction(form: FormData) {
  try {
    const bankId = positiveId(form.get("bank_id"));
    const operation = form.get("operation");
    if (operation !== "create" && operation !== "update" && operation !== "delete") throw new Error("Invalid operation");
    const id = operation === "create" ? null : positiveId(form.get("id"));
    let values;
    if (operation !== "delete") {
      const date = form.get("date"), amount = form.get("amount");
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000")
        || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date
        || typeof amount !== "string" || !/^-?\d+$/.test(amount) || !Number.isInteger(Number(amount))
        || Number(amount) < -2147483648 || Number(amount) > 2147483647) throw new Error("Invalid date or amount");
      const text = (key: string) => { const value = form.get(key); if (typeof value !== "string" || value.length > 5000) throw new Error("Invalid text"); return value || null; };
      values = { date, amount: Number(amount), type_id: positiveId(form.get("type_id")),
        memo: text("memo"), location: text("location"), note: text("note"), tag: text("tag") };
    }
    const { supabase, user } = await getUserDatabase();
    const bank = await supabase.from("bank_accounts").select("payment_method_id").eq("id", bankId).eq("user_id", user.id).maybeSingle();
    if (bank.error || !bank.data) return { success: false, message: "口座を取得できませんでした。" };
    const method = bank.data.payment_method_id;
    if (values) {
      const type = await supabase.from("transaction_types").select("id,name").eq("id", values.type_id).maybeSingle();
      if (type.error || !type.data || !["収入", "支出"].includes(type.data.name)) return { success: false, message: "収入・支出を選択してください。" };
    }
    const result = operation === "create"
      ? await supabase.from("transactions").insert({ ...values!, user_id: user.id, payment_method_id: method }).select("id").single()
      : operation === "update"
        ? await supabase.from("transactions").update(values!).eq("id", id!).eq("user_id", user.id).eq("payment_method_id", method).select("id").maybeSingle()
        : await supabase.from("transactions").delete().eq("id", id!).eq("user_id", user.id).eq("payment_method_id", method).select("id").maybeSingle();
    if (result.error || !result.data) { console.error("bank_transaction_mutation failed", { code: result.error?.code }); return { success: false, message: "操作できませんでした。取引の存在と権限を確認してください。" }; }
    revalidatePath(`/bank-accounts/${bankId}`); revalidatePath("/");
    return { success: true, message: operation === "delete" ? "取引を削除しました。" : "取引を保存しました。" };
  } catch { return { success: false, message: "操作できませんでした。入力内容とログイン状態を確認してください。" }; }
}
