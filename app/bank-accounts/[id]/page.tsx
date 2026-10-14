import BackToDashboard from "@/components/back-to-dashboard";
import FeatureIcon from "@/components/feature-icon";
import { resolveMonthlyBalance } from "@/src/lib/db/resolve-monthly-balance";
import { monthlyOpening } from "@/src/lib/db/monthly-opening";
import { transactionCategoryNames } from "@/src/lib/db/transaction-categories";
import Link from "next/link";
import { Pencil } from "lucide-react";
import type { Database } from "@/src/lib/db/database.types";
import { notFound, redirect } from "next/navigation";
import { getUserDatabase, UserAuthenticationError } from "@/src/lib/db/user";
import { dashboardPeriod, todayInJapan, monthPeriod, shiftMonth, dateWithWeekday } from "@/src/lib/db/dashboard-period";
import { bankCardPayments, plannedCardEntry, runningBankHistory, type BankHistoryEntry } from "@/src/lib/db/bank-history";

import { cardQueryStart } from "@/src/lib/db/card-payment";
import TransferForm from "../transfer-form";
import MonthlyBalanceEditor from "./monthly-balance-editor";
import MonthPicker from "./month-picker";
import TransactionEditor from "./transaction-editor";

export const dynamic = "force-dynamic";
const yen = (amount: number) => new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(amount);

export default async function BankHistoryPage({ params, searchParams, cash = false }: { cash?: boolean; params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) notFound();
  let context;
  try { context = await getUserDatabase(); }
  catch (error) { if (error instanceof UserAuthenticationError) redirect("/login"); throw error; }
  const { supabase, user } = context;
  const bank = await supabase.from("bank_accounts").select("*").eq("user_id", user.id).eq("id", Number(id)).maybeSingle();
  if (bank.error) return <main className="p-8"><p role="alert">口座を取得できませんでした。</p></main>;
  if (!bank.data) notFound();
  const account = bank.data;
  const base = cash ? "/cash" : "/bank-accounts";
  const [settings, methods, types, cards, accounts] = await Promise.all([
    supabase.from("dashboard_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("payment_methods").select("id,name,type"),
    supabase.from("transaction_types").select("id,name"),
    supabase.from("credit_cards").select("*").eq("user_id", user.id).eq("bank_account_payment_method_id", account.payment_method_id).eq("is_active", true),
    supabase.from("bank_accounts").select("id,payment_method_id").eq("user_id", user.id).eq("is_active", true).order("sort_order").order("id"),
  ]);
  if (methods.error || types.error || cards.error || settings.error || accounts.error) return <main className="p-8"><p role="alert">履歴の設定を取得できませんでした。テーブルと読み取り権限を確認してください。</p></main>;
  const method = methods.data?.find(m => m.id === account.payment_method_id);
  if ((method?.type === "cash") !== cash) notFound();
  const today = todayInJapan();
  let period;
  let selectedMonth = today.slice(0, 7);
  const requestedMonth = (await searchParams).month;
  if (requestedMonth && (!/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) || Number(requestedMonth.slice(0, 4)) < 1956 || Number(requestedMonth.slice(0, 4)) > 9998)) notFound();
  const startDay = settings.data?.month_start_day ?? 1, endDay = settings.data?.month_end_day ?? 0;
  const adjustment = settings.data?.month_start_holiday_adjustment ?? "none";
  try {
    if (requestedMonth) { selectedMonth = requestedMonth; period = monthPeriod(selectedMonth, startDay, endDay, adjustment); }
    else {
      period = dashboardPeriod(today, startDay, endDay, adjustment);
      for (const offset of [-1, 0, 1]) { const month = shiftMonth(today.slice(0, 7), offset); if (monthPeriod(month, startDay, endDay, adjustment).start === period.start) { selectedMonth = month; break; } }
    }
  }
  catch { return <main className="p-8"><p role="alert">対象期間を計算できませんでした。祝日データの対象年と休日調整の設定を確認してください。</p><Link href={`${base}/${id}`}>今月へ戻る</Link></main>; }
  let monthlyBalance;
  try { monthlyBalance = await resolveMonthlyBalance(supabase,user.id,account,selectedMonth,settings.data,today); }
  catch(error) { return <main className="p-8"><p role="alert">{error instanceof Error ? error.message : "繰越金を取得できませんでした。"}</p></main>; }
  const opening = monthlyOpening(monthlyBalance), carryover = monthlyBalance.carryover_amount;
  const payments = bankCardPayments(period.start, period.end, cards.data ?? []);
  let earliest = period.start;
  for (const payment of payments) if (cardQueryStart(payment.period.start) < earliest) earliest = cardQueryStart(payment.period.start);
  const rows: Database["public"]["Tables"]["transactions"]["Row"][] = [];
  const ids = [...new Set([account.payment_method_id, ...(cards.data ?? []).map(card => card.payment_method_id)])];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("transactions").select("*")
      .eq("user_id", user.id).in("payment_method_id", ids).gte("date", earliest).lte("date", period.end).order("id").range(offset, offset + 499);
    if (error) return <main className="p-8"><p role="alert">取引履歴を取得できませんでした。</p></main>;
    rows.push(...(data ?? [])); if (!data || data.length < 500) break;
  }
  let categories;
  try { categories = await transactionCategoryNames(supabase,rows); }
  catch { return <main className="p-8"><p role="alert">カテゴリを取得できませんでした。</p></main>; }
  const typeNames = new Map((types.data ?? []).map(type => [type.id, type.name]));
  const names = new Map((methods.data ?? []).map(method => [method.id, method.name]));
  const entries: BankHistoryEntry[] = [];
  for (const row of rows) {
    if (row.payment_method_id !== account.payment_method_id) continue;
    const type = row.type_id === null ? undefined : typeNames.get(row.type_id);
    const change = row.amount !== null && Number.isSafeInteger(row.amount) && (type === "収入" || type === "支出") ? (type === "収入" ? row.amount : -row.amount) : null;
    if (row.date >= period.start) entries.push({ key: `transaction-${row.id}`, date: row.date, description: row.memo || row.location || row.note || type || "取引", change, planned: row.date > today });
  }
  entries.push(...payments
    .map(payment => plannedCardEntry(payment, rows, types.data ?? [], names.get(payment.card.payment_method_id) ?? "カード", today))
    .filter(entry => entry.change !== 0));
  const transactionMap = new Map(rows.filter(row => row.payment_method_id === account.payment_method_id).map(row => [`transaction-${row.id}`, row]));
  const history = runningBankHistory(entries, opening);
  const unconfigured = (cards.data ?? []).filter(card => card.closing_day === null || card.payment_day === null || !Number.isInteger(card.payment_month_offset));
  return <main data-theme={cash ? "cash" : "bank"} className="bg-gray-50 px-4 py-8 text-gray-900 dark:bg-gray-900 dark:text-gray-100"><div className="mx-auto max-w-6xl space-y-6">
    <BackToDashboard/>
    <header><h1 className="flex items-center gap-3 text-2xl font-bold"><FeatureIcon kind={cash ? "cash" : "bank"}/>{names.get(account.payment_method_id) ?? "銀行口座"} の取引履歴</h1><p className="mt-2 text-sm text-gray-500">{dateWithWeekday(period.start)} 〜 {dateWithWeekday(period.end)}</p></header>
    <div className="flex flex-wrap items-center justify-between gap-4"><nav aria-label="対象月" className="flex flex-wrap items-center gap-3"><Link href={`?month=${shiftMonth(selectedMonth, -1)}`} className="rounded-lg border px-3 py-2 text-sm">← 前月</Link><MonthPicker month={selectedMonth}/><Link href={`?month=${shiftMonth(selectedMonth, 1)}`} className="rounded-lg border px-3 py-2 text-sm">翌月 →</Link><Link href={`${base}/${id}`} className="text-sm text-indigo-600">今月</Link></nav><div className="flex flex-wrap gap-3"><MonthlyBalanceEditor key={selectedMonth} bankId={account.id} month={selectedMonth} opening={opening} carryover={carryover} override={monthlyBalance.opening_override}/><TransferForm bankId={account.id} date={today} accounts={(accounts.data ?? []).map(bank => ({ id: bank.id, name: names.get(bank.payment_method_id) ?? "銀行口座" }))}/><TransactionEditor bankId={account.id} types={types.data ?? []} date={period.start}/></div></div>
    <p className="text-sm text-gray-500 dark:text-gray-400">月初金額には前月からの繰越金を使います。個別指定した場合はその金額を優先し、未設定の月は前月の月末残高を繰り越します。{cash ? "現金の入出金から残高を計算します。" : "カードは利用明細を表示せず、引き落とし予定を反映します。予定を含む残高は実際の口座残高とは異なります。"}</p>
    {!cash && <p className="text-xs text-gray-500 dark:text-gray-400">銀行取引に実際のカード引き落としも記録されている場合、予定と両方が反映されます。</p>}

    {unconfigured.length > 0 && <p role="alert" className="text-sm text-amber-700">支払設定が未完了のカード{unconfigured.length}枚は予定を表示していません。</p>}
    <section className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"><table className="w-full min-w-[1104px] table-fixed text-sm tabular-nums">
      <colgroup><col className="w-44"/><col/><col className="w-28"/><col className="w-28"/><col className="w-36"/><col className="w-36"/><col className="w-36"/><col className="w-20"/></colgroup>
      <thead className="border-b border-gray-200 bg-gray-50 text-left dark:border-gray-700 dark:bg-gray-900"><tr><th className="px-4 py-1.5">日付</th><th className="px-4 py-1.5">内容</th><th className="px-4 py-1.5">親カテゴリ</th><th className="px-4 py-1.5">子カテゴリ</th><th className="px-4 py-1.5 text-right">入金</th><th className="px-4 py-1.5 text-right">出金</th><th className="px-4 py-1.5 text-right">累計残高</th><th className="px-4 py-1.5 text-center">操作</th></tr></thead>
      <tbody><tr className="border-b border-gray-100 dark:border-gray-700"><td className="px-4 py-1.5 whitespace-nowrap">{dateWithWeekday(period.start)}</td><td className="px-4 py-1.5">月初金額{monthlyBalance.automatic && <span className="ml-2 text-xs text-gray-500">（前月繰越）</span>}</td><td/><td/><td/><td/><td className="px-4 py-1.5 text-right font-semibold">{yen(opening)}</td><td/></tr>
        {history.map(row => <tr key={row.key} className="border-b border-gray-100 last:border-0 dark:border-gray-700"><td className="px-4 py-1.5 whitespace-nowrap">{dateWithWeekday(row.date)}</td><td className="break-words px-4 py-1.5">{row.description}{row.planned && !row.key.startsWith("card-") && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">予定</span>}</td><td className="break-words px-4 py-1.5">{categories.parents.get(transactionMap.get(row.key)?.parent_category_id ?? -1) ?? ""}</td><td className="break-words px-4 py-1.5">{categories.children.get(transactionMap.get(row.key)?.child_category_id ?? -1) ?? ""}</td><td className="px-4 py-1.5 text-right whitespace-nowrap">{row.change !== null && row.change > 0 ? yen(row.change) : ""}</td><td className="px-4 py-1.5 text-right whitespace-nowrap">{row.change === null ? "金額不明" : row.change < 0 ? yen(-row.change) : ""}</td><td className="px-4 py-1.5 text-right whitespace-nowrap font-semibold">{row.cumulative === null ? "計算不可" : yen(row.cumulative)}</td><td className="px-4 py-1.5 text-center leading-none">{row.key === "carryover" ? <MonthlyBalanceEditor compact bankId={account.id} month={selectedMonth} opening={opening} carryover={carryover} override={monthlyBalance.opening_override}/> : transactionMap.has(row.key) ? <TransactionEditor bankId={account.id} transaction={transactionMap.get(row.key)!} types={types.data ?? []} date={row.date}/> : <Link href="/cards" aria-label="カード設定を編集" title="カード設定を編集" className="inline-flex h-5 w-5 align-middle items-center justify-center rounded-lg text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950"><Pencil size={18} aria-hidden="true"/></Link>}</td></tr>)}
        {!history.length && <tr><td colSpan={8} className="p-8 text-center text-gray-500">対象期間の取引・カード引き落とし予定はありません。</td></tr>}
      </tbody></table></section>
  </div></main>;
}
