import Link from "next/link";
import { Pencil } from "lucide-react";
import type { Database } from "@/src/lib/db/database.types";
import { notFound, redirect } from "next/navigation";
import { getUserDatabase, UserAuthenticationError } from "@/src/lib/db/user";
import { dashboardPeriod, todayInJapan, monthPeriod, shiftMonth, dateWithWeekday } from "@/src/lib/db/dashboard-period";
import { bankCardPayments, plannedCardEntry, runningBankHistory, type BankHistoryEntry } from "@/src/lib/db/bank-history";

import TransactionEditor from "./transaction-editor";

export const dynamic = "force-dynamic";
const yen = (amount: number) => new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(amount);

export default async function BankHistoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
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
  const [settings, methods, types, cards] = await Promise.all([
    supabase.from("dashboard_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("payment_methods").select("id,name"),
    supabase.from("transaction_types").select("id,name"),
    supabase.from("credit_cards").select("*").eq("user_id", user.id).eq("bank_account_payment_method_id", account.payment_method_id).eq("is_active", true),
  ]);
  if (methods.error || types.error || cards.error || settings.error) return <main className="p-8"><p role="alert">履歴の設定を取得できませんでした。テーブルと読み取り権限を確認してください。</p></main>;
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
  catch { return <main className="p-8"><p role="alert">対象期間を計算できませんでした。祝日データの対象年と休日調整の設定を確認してください。</p><Link href={`/bank-accounts/${id}`}>今月へ戻る</Link></main>; }
  const payments = bankCardPayments(period.start, period.end, cards.data ?? []);
  let earliest = account.opening_balance_date && account.opening_balance_date < period.start ? account.opening_balance_date : period.start;
  for (const payment of payments) if (payment.period.start < earliest) earliest = payment.period.start;
  const rows: Database["public"]["Tables"]["transactions"]["Row"][] = [];
  const ids = [...new Set([account.payment_method_id, ...(cards.data ?? []).map(card => card.payment_method_id)])];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("transactions").select("*")
      .eq("user_id", user.id).in("payment_method_id", ids).gte("date", earliest).lte("date", period.end).order("id").range(offset, offset + 499);
    if (error) return <main className="p-8"><p role="alert">取引履歴を取得できませんでした。</p></main>;
    rows.push(...(data ?? [])); if (!data || data.length < 500) break;
  }
  const typeNames = new Map((types.data ?? []).map(type => [type.id, type.name]));
  const names = new Map((methods.data ?? []).map(method => [method.id, method.name]));
  let opening: number | null = account.opening_balance !== null && account.opening_balance_date !== null && account.opening_balance_date <= period.start ? account.opening_balance : null;
  const entries: BankHistoryEntry[] = [];
  for (const row of rows) {
    if (row.payment_method_id !== account.payment_method_id) continue;
    const type = row.type_id === null ? undefined : typeNames.get(row.type_id);
    const change = row.amount !== null && Number.isSafeInteger(row.amount) && (type === "収入" || type === "支出") ? (type === "収入" ? row.amount : -row.amount) : null;
    if (row.date < period.start) {
      if (opening !== null && account.opening_balance_date && row.date >= account.opening_balance_date) opening = change === null ? null : opening + change;
    } else entries.push({ key: `transaction-${row.id}`, date: row.date, description: row.memo || row.location || row.note || type || "取引", change, planned: row.date > today });
  }
  entries.push(...payments
    .map(payment => plannedCardEntry(payment, rows, types.data ?? [], names.get(payment.card.payment_method_id) ?? "カード", today))
    .filter(entry => entry.change !== 0));
  const transactionMap = new Map(rows.filter(row => row.payment_method_id === account.payment_method_id).map(row => [`transaction-${row.id}`, row]));
  const history = runningBankHistory(entries, opening);
  const unconfigured = (cards.data ?? []).filter(card => card.closing_day === null || card.payment_day === null || !Number.isInteger(card.payment_month_offset));
  return <main className="bg-gray-50 px-4 py-8 text-gray-900 dark:bg-gray-900 dark:text-gray-100"><div className="mx-auto max-w-6xl space-y-6">
    <Link href="/" className="text-sm text-indigo-600 dark:text-indigo-300">← ダッシュボードへ戻る</Link>
    <header><h1 className="text-2xl font-bold">{names.get(account.payment_method_id) ?? "銀行口座"} の取引履歴</h1><p className="mt-2 text-sm text-gray-500">{dateWithWeekday(period.start)} 〜 {dateWithWeekday(period.end)}</p></header>
    <div className="flex flex-wrap items-center justify-between gap-4"><nav aria-label="対象月" className="flex flex-wrap items-center gap-3"><Link href={`?month=${shiftMonth(selectedMonth, -1)}`} className="rounded-lg border px-3 py-2 text-sm">← 前月</Link><form className="flex gap-2"><input aria-label="対象月" type="month" name="month" defaultValue={selectedMonth} className="rounded-lg border border-gray-300 bg-white p-2 dark:bg-gray-800 dark:border-gray-600"/><button className="rounded-lg border px-3 py-2 text-sm">表示</button></form><Link href={`?month=${shiftMonth(selectedMonth, 1)}`} className="rounded-lg border px-3 py-2 text-sm">翌月 →</Link><Link href={`/bank-accounts/${id}`} className="text-sm text-indigo-600">今月</Link></nav><TransactionEditor bankId={account.id} types={types.data ?? []} date={period.start}/></div>
    <p className="text-sm text-gray-500 dark:text-gray-400">累計残高は月初残高から計算します。カードは利用明細を表示せず、引き落とし予定を反映します。予定を含む残高は実際の口座残高とは異なります。</p>
    <p className="text-xs text-gray-500 dark:text-gray-400">銀行取引に実際のカード引き落としも記録されている場合、予定と両方が反映されます。</p>
    {opening === null && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">月初残高を計算できません。開始残高・基準日と、金額・種別が未設定の取引を確認してください。</p>}
    {unconfigured.length > 0 && <p role="alert" className="text-sm text-amber-700">支払設定が未完了のカード{unconfigured.length}枚は予定を表示していません。</p>}
    <section className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"><table className="w-full min-w-[640px] text-sm">
      <thead className="border-b border-gray-200 bg-gray-50 text-left dark:border-gray-700 dark:bg-gray-900"><tr><th className="p-4">日付</th><th className="p-4">内容</th><th className="p-4 text-right">入金</th><th className="p-4 text-right">出金</th><th className="p-4 text-right">累計残高</th><th className="p-4 text-center">操作</th></tr></thead>
      <tbody><tr className="border-b border-gray-100 dark:border-gray-700"><td className="p-4 whitespace-nowrap">{dateWithWeekday(period.start)}</td><td className="p-4">月初残高</td><td/><td/><td className="p-4 text-right font-semibold">{opening === null ? "未設定" : yen(opening)}</td><td/></tr>
        {history.map(row => <tr key={row.key} className="border-b border-gray-100 last:border-0 dark:border-gray-700"><td className="p-4 whitespace-nowrap">{dateWithWeekday(row.date)}</td><td className="p-4">{row.description}{row.planned && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">予定</span>}</td><td className="p-4 text-right whitespace-nowrap">{row.change !== null && row.change > 0 ? yen(row.change) : "—"}</td><td className="p-4 text-right whitespace-nowrap">{row.change === null ? "金額不明" : row.change <= 0 ? yen(-row.change) : "—"}</td><td className="p-4 text-right whitespace-nowrap font-semibold">{row.cumulative === null ? "計算不可" : yen(row.cumulative)}</td><td className="p-4 text-center">{transactionMap.has(row.key) ? <TransactionEditor bankId={account.id} transaction={transactionMap.get(row.key)!} types={types.data ?? []} date={row.date}/> : <Link href="/cards" aria-label="カード設定を編集" title="カード設定を編集" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950"><Pencil size={18} aria-hidden="true"/></Link>}</td></tr>)}
        {!history.length && <tr><td colSpan={6} className="p-8 text-center text-gray-500">対象期間の取引・カード引き落とし予定はありません。</td></tr>}
      </tbody></table></section>
  </div></main>;
}
