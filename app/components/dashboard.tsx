import { resolveMonthlyBalance } from "@/src/lib/db/resolve-monthly-balance";
import { monthlyOpening } from "@/src/lib/db/monthly-opening";
import AccountOrder from "@/components/account-order";
import Link from "next/link";
import { getUserDatabase } from "@/src/lib/db/user";
import { dashboardPeriod, todayInJapan, monthPeriod, shiftMonth } from "@/src/lib/db/dashboard-period";
import { summarizeTransactions, type DashboardTransaction } from "@/src/lib/db/dashboard-calculations";

import { nextCardPaymentPeriod, cardPaymentAmount, cardQueryStart } from "@/src/lib/db/card-payment";

const yen = (value: number) => new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(value);
const box = "rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800";

export default async function Dashboard() {
  const { supabase, user } = await getUserDatabase();
  const [methods, banks, cards, types, settings] = await Promise.all([
    supabase.from("payment_methods").select("id,name,type").order("name"),
    supabase.from("bank_accounts").select("*").eq("user_id", user.id).eq("is_active", true).order("sort_order").order("id"),
    supabase.from("credit_cards").select("*").eq("user_id", user.id).eq("is_active", true).order("sort_order").order("id"),
    supabase.from("transaction_types").select("id,name"),
    supabase.from("dashboard_settings").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  if (methods.error || banks.error || cards.error || types.error) {
    return <section className={box}><h1 className="text-2xl font-bold">ダッシュボード</h1><p role="alert" className="mt-4 text-sm text-rose-600">データを取得できませんでした。カード・銀行口座のテーブルと読み取り権限を確認してください。</p></section>;
  }
  const today = todayInJapan();
  let period;
  try { period = dashboardPeriod(today, settings.data?.month_start_day ?? 1, settings.data?.month_end_day ?? 0, settings.data?.month_start_holiday_adjustment ?? "none"); }
  catch { return <section className={box}><p role="alert">開始日の休日調整を計算できませんでした。祝日データを更新するか、設定で「調整しない」を選んでください。</p><Link href="/settings" className="text-indigo-600">設定へ</Link></section>; }
  const bankRows = banks.data ?? [], cardRows = cards.data ?? [];
  let selectedMonth = today.slice(0,7);
  for (const offset of [-1,0,1]) {
    const month = shiftMonth(today.slice(0,7),offset);
    if (monthPeriod(month,settings.data?.month_start_day ?? 1,settings.data?.month_end_day ?? 0,settings.data?.month_start_holiday_adjustment ?? "none").start === period.start) { selectedMonth = month; break; }
  }
  let calculationBanks;
  try {
    calculationBanks = await Promise.all(bankRows.map(async bank => {
      const balance = await resolveMonthlyBalance(supabase,user.id,bank,selectedMonth,settings.data,today);
      return {payment_method_id:bank.payment_method_id,opening_balance:monthlyOpening(balance),opening_balance_date:period.start};
    }));
  } catch { return <section className={box}><p role="alert">月初金額・繰越金を計算できませんでした。前月以前の取引の金額・種別を確認してください。</p></section>; }
  const payments = cardRows.map(card => ({ card, period: nextCardPaymentPeriod(today, card) }));
  const cardEarliest = payments.reduce((date, item) => item.period && item.period.start < date ? item.period.start : date, period.start);
  const earliest = cardQueryStart(cardEarliest);
  const rows: DashboardTransaction[] = [];
  let queryFailed = false;
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("transactions").select("date,payment_method_id,type_id,amount,transfer_id,card_deferred")
      .eq("user_id", user.id).gte("date", earliest).lte("date", today).order("id").range(offset, offset + 499);
    if (error) { queryFailed = true; break; }
    rows.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  if (queryFailed) return <section className={box}><p role="alert">取引を取得できませんでした。集計は表示していません。</p></section>;
  const totals = summarizeTransactions(rows, types.data ?? [], calculationBanks, period);
  const names = new Map((methods.data ?? []).map(method => [method.id, method.name]));
  const cardTotal = payments.reduce((sum, item) => sum + (item.period ? cardPaymentAmount(rows, item.card.payment_method_id, types.data ?? [], item.period, today, item.card.closing_day) : 0), 0);
  const configuredCards = payments.filter(item => item.period !== null).length;
  const knownBalances = bankRows.map(bank => totals.balances.get(bank.payment_method_id)).filter((amount): amount is number => amount !== null && amount !== undefined);
  const sumBalance = knownBalances.reduce((sum, amount) => sum + amount, 0);
  return <div className="space-y-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold tracking-widest text-indigo-600 dark:text-indigo-300">家計管理</p><h1 className="mt-2 text-3xl font-bold">ダッシュボード</h1><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">集計期間：{period.start} 〜 {period.end} ／ {today}時点</p></div><Link href="/settings" className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600">集計期間を設定</Link></header>
    {settings.error && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">集計期間の設定を取得できないため、1日〜月末で表示しています。設定用SQLを適用してください。</p>}
    {(totals.unsupportedCount > 0 || totals.missingAmountCount > 0) && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">種別不明の取引{totals.unsupportedCount}件・金額未設定の取引{totals.missingAmountCount}件を集計から除外しています。表示額は参考値です。</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <section className={box}><p className="text-sm text-gray-500 dark:text-gray-400">銀行口座の記録上の残高合計</p><p className="mt-3 text-3xl font-bold">{knownBalances.length ? yen(sumBalance) : "未設定"}</p><p className="mt-2 text-xs text-gray-500">{bankRows.length}口座の月初金額・繰越金と入出金を集計</p></section>
      <section className={box}><p className="text-sm text-gray-500 dark:text-gray-400">クレジットカード次回支払予定額合計</p><p className="mt-3 text-3xl font-bold text-indigo-600 dark:text-indigo-300">{configuredCards ? yen(cardTotal) : "未設定"}</p><p className="mt-2 text-xs text-gray-500">各カードの次回分を合計（{configuredCards}／{cardRows.length}枚・本日時点）</p></section>
    </div>
    <section className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">銀行口座</h2><div className="flex items-center gap-3"><AccountOrder kind="bank" items={bankRows.map(bank => ({ id: bank.id, name: names.get(bank.payment_method_id) ?? "銀行口座" }))}/><Link href="/bank-accounts" className="text-sm text-indigo-600 dark:text-indigo-300">口座設定 →</Link></div></div>
      <p className="text-xs text-gray-500 dark:text-gray-400">月初金額は繰越金を使い、個別指定がある場合はその金額を優先します。対象月の入出金を反映します。カードの利用分は自動で差し引かず、記録された口座の入出金を反映します。</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{bankRows.map(bank => { const balance = totals.balances.get(bank.payment_method_id); return <Link key={bank.id} href={`/bank-accounts/${bank.id}`} className={`${box} block transition-colors hover:border-indigo-400 dark:hover:border-indigo-500`}><h3 className="font-semibold">{names.get(bank.payment_method_id) ?? "口座名を取得できません"}</h3><p className="mt-4 text-2xl font-bold">{balance === null || balance === undefined ? "残高未設定" : yen(balance)}</p><p className="mt-2 text-xs text-gray-500">{`集計開始日：${period.start}`}</p><p className="mt-4 text-sm text-indigo-600 dark:text-indigo-300">対象月の履歴を見る →</p></Link>; })}</div>
      {!bankRows.length && <p className={box}>利用中の銀行口座設定がありません。口座設定から登録してください。</p>}
    </section>
    <section className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">クレジットカード</h2><div className="flex items-center gap-3"><AccountOrder kind="card" items={cardRows.map(card => ({ id: card.id, name: names.get(card.payment_method_id) ?? "クレジットカード" }))}/><Link href="/cards" className="text-sm text-indigo-600 dark:text-indigo-300">カード設定 →</Link></div></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{payments.map(({ card, period: payment }) => <Link key={card.id} href={`/cards/${card.id}`} className={`${box} block transition-colors hover:border-indigo-400 dark:hover:border-indigo-500`}><h3 className="font-semibold">{names.get(card.payment_method_id) ?? "カード名を取得できません"}</h3><p className="mt-4 text-2xl font-bold">{payment ? yen(cardPaymentAmount(rows, card.payment_method_id, types.data ?? [], payment, today, card.closing_day)) : "支払設定を確認"}</p>{payment ? <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400"><p>次回支払日：{payment.due}</p><p>対象期間：{payment.start} 〜 {payment.end}</p>{payment.open && <p className="text-amber-700 dark:text-amber-300">締め日前のため本日までの暫定額</p>}</div> : <p className="mt-2 text-xs text-gray-500">締め日・引き落とし日・支払月を設定してください。</p>}<p className="mt-4 text-sm text-indigo-600 dark:text-indigo-300">利用明細を見る →</p></Link>)}</div>
      {!cardRows.length && <p className={box}>利用中のカード設定がありません。カード設定から登録してください。</p>}
    </section>
    <p className="text-xs text-gray-500 dark:text-gray-400">正規化後のtransactionsを集計しています。CSV取込直後のtransactions_workは含みません。支払予定額は記録済み取引から計算した額です。支払日が本日のカードも含みます。金融機関の休業日による日付変更は反映しません。</p>
  </div>;
}
