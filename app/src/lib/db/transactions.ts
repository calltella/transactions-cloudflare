import { getUserDatabase } from "./user";
import type { TransactionInput } from "./database.types";

export interface TransactionSearch {
  dateFrom?: string;
  dateTo?: string;
  memo?: string;
  offset?: number;
  limit?: number;
}

export async function listTransactions(filters: TransactionSearch = {}) {
  const { supabase, user } = await getUserDatabase();
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500 ||
      !Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid pagination.");
  let query = supabase.from("transactions_work").select("*", { count: "exact" })
    .eq("user_id", user.id).order("date", { ascending: false }).order("id", { ascending: false });
  if (filters.dateFrom) query = query.gte("date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("date", filters.dateTo);
  if (filters.memo) query = query.ilike("memo", `%${filters.memo.replace(/[\\%_]/g, "\\$&")}%`);
  const { data, count, error } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error("取引一覧を取得できませんでした。");
  return { rows: data, count };
}

export async function getTransaction(id: number) {
  const { supabase, user } = await getUserDatabase();
  const { data, error } = await supabase.from("transactions_work").select("*")
    .eq("user_id", user.id).eq("id", id).maybeSingle();
  if (error) throw new Error("取引を取得できませんでした。");
  return data;
}

export async function updateTransaction(id: number, values: Partial<TransactionInput>) {
  // Runtime allowlist prevents an untyped request from changing id/user_id/created_at.
  const fields = ["date", "type", "payment_method", "parent_category", "child_category",
    "amount", "location", "memo", "note", "tag"];
  if (!Object.keys(values).length || Object.keys(values).some((key) => !fields.includes(key))) {
    throw new Error("Invalid transaction fields.");
  }
  const { supabase, user } = await getUserDatabase();
  const { data, error } = await supabase.from("transactions_work").update(values)
    .eq("user_id", user.id).eq("id", id).select("*").maybeSingle();
  if (error) throw new Error("取引を更新できませんでした。");
  return data;
}

export async function deleteTransaction(id: number) {
  const { supabase, user } = await getUserDatabase();
  const { data, error } = await supabase.from("transactions_work").delete()
    .eq("user_id", user.id).eq("id", id).select("id").maybeSingle();
  if (error) throw new Error("取引を削除できませんでした。");
  return data !== null;
}
