import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, BankAccountRow } from "./database.types";
import { monthPeriod } from "./dashboard-period";
import { monthlyOpening } from "./monthly-opening";
import { bankCardPayments, plannedCardEntry } from "./bank-history";
import { cardQueryStart } from "./card-payment";

type Settings = Database["public"]["Tables"]["dashboard_settings"]["Row"] | null;
export async function resolveMonthlyBalance(db: SupabaseClient<Database>, userId: string, bank: BankAccountRow, month: string, settings: Settings, today: string) {
  const saved = await db.from("bank_monthly_balances").select("*").eq("user_id",userId).eq("bank_account_id",bank.id)
    .lte("month",`${month}-01`).order("month",{ascending:false}).limit(1).maybeSingle();
  if(saved.error) throw new Error("月初金額を取得できませんでした。");
  if(!saved.data) return {opening_amount:0,carryover_amount:0,opening_override:false,automatic:false};
  if(saved.data.month === `${month}-01`) return {...saved.data,automatic:false};
  const period = (value: string) => monthPeriod(value,settings?.month_start_day ?? 1,settings?.month_end_day ?? 0,settings?.month_start_holiday_adjustment ?? "none");
  const start = period(saved.data.month.slice(0,7)).start;
  const currentStart = period(month).start;
  const last = new Date(`${currentStart}T00:00:00Z`);last.setUTCDate(last.getUTCDate()-1);
  const end = last.toISOString().slice(0,10);
  const [cards,types] = await Promise.all([
    db.from("credit_cards").select("*").eq("user_id",userId).eq("bank_account_payment_method_id",bank.payment_method_id).eq("is_active",true),
    db.from("transaction_types").select("id,name"),
  ]);
  if(cards.error || types.error) throw new Error("繰越金の設定を取得できませんでした。");
  const payments = bankCardPayments(start,end,cards.data ?? []);
  let earliest = start;
  for(const payment of payments) if(cardQueryStart(payment.period.start)<earliest) earliest=cardQueryStart(payment.period.start);
  const ids = [...new Set([bank.payment_method_id,...(cards.data ?? []).map(card=>card.payment_method_id)])];
  const rows: Database["public"]["Tables"]["transactions"]["Row"][] = [];
  for(let offset=0;;offset+=500) {
    const result = await db.from("transactions").select("*").eq("user_id",userId).in("payment_method_id",ids).gte("date",earliest).lte("date",end).order("id").range(offset,offset+499);
    if(result.error) throw new Error("繰越金の取引を取得できませんでした。");
    rows.push(...(result.data ?? []));if(!result.data || result.data.length<500)break;
  }
  const names = new Map((types.data ?? []).map(type=>[type.id,type.name]));
  let carryover = monthlyOpening(saved.data);
  for(const row of rows) {
    if(row.payment_method_id!==bank.payment_method_id || row.date<start)continue;
    const type = row.type_id===null?undefined:names.get(row.type_id);
    if(row.amount===null || !Number.isSafeInteger(row.amount) || !["収入","支出"].includes(type ?? "")) throw new Error("前月以前の取引の金額・種別を設定してください。");
    carryover += type === "収入" ? row.amount : -row.amount;
  }
  for(const payment of payments) {
    const entry=plannedCardEntry(payment,rows,types.data ?? [],"カード",today);
    if(entry.change===null) throw new Error("カード明細の金額・種別を設定してください。");
    carryover+=entry.change;
  }
  if(!Number.isSafeInteger(carryover))throw new Error("繰越金が計算できる範囲を超えています。");
  return {opening_amount:0,carryover_amount:carryover,opening_override:false,automatic:true};
}
