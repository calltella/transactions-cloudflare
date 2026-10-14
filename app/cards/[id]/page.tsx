import BackToDashboard from "@/components/back-to-dashboard";
import FeatureIcon from "@/components/feature-icon";
import { transactionCategoryNames } from "@/src/lib/db/transaction-categories";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getUserDatabase, UserAuthenticationError } from "@/src/lib/db/user";
import type { Database } from "@/src/lib/db/database.types";
import { nextCardPaymentPeriod, cardPaymentAmount, cardBillingDate, cardQueryStart } from "@/src/lib/db/card-payment";
import { todayInJapan, shiftMonth, monthPeriod, dateWithWeekday } from "@/src/lib/db/dashboard-period";
import MonthPicker from "@/bank-accounts/[id]/month-picker";
import TransactionEditor from "./transaction-editor";

export const dynamic = "force-dynamic";
const yen = (amount: number) => new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(amount);
export default async function CardHistoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) notFound();
  let context;
  try { context = await getUserDatabase(); }
  catch(error) { if(error instanceof UserAuthenticationError) redirect("/login"); throw error; }
  const { supabase, user } = context;
  const card = await supabase.from("credit_cards").select("*").eq("id",Number(id)).eq("user_id",user.id).maybeSingle();
  if(card.error) return <main data-theme="card" className="p-8"><p role="alert">カードを取得できませんでした。</p></main>;
  if(!card.data) notFound();
  const account = card.data, today = todayInJapan();
  const requestedMonth = (await searchParams).month;
  if(requestedMonth && (!/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) || requestedMonth < "1956-01" || requestedMonth > "9998-12")) notFound();
  const upcoming = nextCardPaymentPeriod(today, account);
  const month = requestedMonth ?? upcoming?.due.slice(0,7) ?? today.slice(0,7);
  const payment = requestedMonth ? nextCardPaymentPeriod(`${month}-01`,account) : upcoming;
  const period = payment ?? monthPeriod(month,1,0);
  const [method,types] = await Promise.all([
    supabase.from("payment_methods").select("name").eq("id",account.payment_method_id).maybeSingle(),
    supabase.from("transaction_types").select("id,name"),
  ]);
  if(method.error || types.error) return <main data-theme="card" className="p-8"><p role="alert">明細の設定を取得できませんでした。</p></main>;
  const fetchedRows: Database["public"]["Tables"]["transactions"]["Row"][] = [];
  for(let offset=0;;offset+=500) {
    const result = await supabase.from("transactions").select("*").eq("user_id",user.id).eq("payment_method_id",account.payment_method_id)
      .gte("date",payment ? cardQueryStart(period.start) : period.start).lte("date",period.end).order("date").order("id").range(offset,offset+499);
    if(result.error) return <main data-theme="card" className="p-8"><p role="alert">利用明細を取得できませんでした。</p></main>;
    fetchedRows.push(...(result.data ?? []));if(!result.data || result.data.length<500)break;
  }
  const rows = fetchedRows.filter(row => {
    const billingDate = payment ? cardBillingDate(row,account.closing_day) : row.date;
    return billingDate >= period.start && billingDate <= period.end;
  });
  let categories;
  try { categories = await transactionCategoryNames(supabase,rows); }
  catch { return <main data-theme="card" className="p-8"><p role="alert">カテゴリを取得できませんでした。</p></main>; }
  const typeNames = new Map((types.data ?? []).map(type=>[type.id,type.name]));
  const amount = cardPaymentAmount(rows,account.payment_method_id,types.data ?? [],period,today,account.closing_day);
  const unknown = rows.some(row=>row.date<=today && (row.amount===null || row.type_id===null || !["収入","支出"].includes(typeNames.get(row.type_id) ?? "")));
  return <main data-theme="card" className="bg-gray-50 px-4 py-8 text-gray-900 dark:bg-gray-900 dark:text-gray-100"><div className="mx-auto max-w-6xl space-y-6">
    <BackToDashboard/>
    <header><h1 className="flex items-center gap-3 text-2xl font-bold"><FeatureIcon kind="card"/>{method.data?.name ?? "クレジットカード"} の利用明細</h1><p className="mt-2 text-sm text-gray-500">{dateWithWeekday(period.start)} 〜 {dateWithWeekday(period.end)}</p></header>
    <div className="flex flex-wrap items-center justify-between gap-4"><nav aria-label="支払月" className="flex flex-wrap items-center gap-3"><Link href={`?month=${shiftMonth(month,-1)}`} className="rounded-lg border px-3 py-2 text-sm">← 前月</Link><span className="text-sm">{payment ? "支払月" : "対象月"}</span><MonthPicker month={month}/><Link href={`?month=${shiftMonth(month,1)}`} className="rounded-lg border px-3 py-2 text-sm">翌月 →</Link><Link href={`/cards/${id}`} className="text-sm text-indigo-600">次回分</Link></nav><TransactionEditor cardId={account.id} types={types.data ?? []} date={today >= period.start && today <= period.end ? today : period.start}/></div>
    {payment ? <section className="rounded-xl border bg-white p-5 dark:border-gray-700 dark:bg-gray-800"><p className="text-sm">支払予定額（本日時点）</p><p className="mt-2 text-2xl font-bold">{yen(amount)}</p><p className="mt-2 text-sm">支払日：{dateWithWeekday(payment.due)}</p>{period.end>today && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">締め日前のため本日までの暫定額です。</p>}</section> : <p role="alert" className="text-sm text-amber-700">支払設定が未完了のため、選択した月の利用明細を表示しています。<Link href="/cards" className="ml-2 underline">カード設定へ</Link></p>}
    <p className="text-sm text-gray-500">各明細の鉛筆ボタンから内容を修正・削除できます。支払予定額は支出を集計し、負の支出（返金）は差し引きます。未来の明細は予定額に含めません。</p>
    {unknown && <p role="alert" className="text-sm text-amber-700">金額・種別が未設定の明細があるため、支払予定額は参考値です。</p>}
    <section className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"><table className="w-full min-w-[864px] table-fixed text-sm tabular-nums"><colgroup><col className="w-44"/><col/><col className="w-28"/><col className="w-28"/><col className="w-20"/><col className="w-36"/><col className="w-20"/></colgroup><thead className="border-b bg-gray-50 text-left dark:border-gray-700 dark:bg-gray-900"><tr><th className="px-4 py-1.5">日付</th><th className="px-4 py-1.5">内容</th><th className="px-4 py-1.5">親カテゴリ</th><th className="px-4 py-1.5">子カテゴリ</th><th className="px-4 py-1.5">種別</th><th className="px-4 py-1.5 text-right">金額</th><th className="px-4 py-1.5 text-center">操作</th></tr></thead>
      <tbody>{rows.map(row=><tr key={row.id} className="border-b border-gray-100 last:border-0 dark:border-gray-700"><td className="whitespace-nowrap px-4 py-1.5">{dateWithWeekday(row.date)}</td><td className="break-words px-4 py-1.5">{row.memo || row.location || row.note || "カード利用"}{row.card_deferred && <span className="ml-2 rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">翌月処理</span>}{row.date>today && <span className="ml-2 text-xs text-amber-700">予定</span>}</td><td className="break-words px-4 py-1.5">{categories.parents.get(row.parent_category_id ?? -1) ?? ""}</td><td className="break-words px-4 py-1.5">{categories.children.get(row.child_category_id ?? -1) ?? ""}</td><td className="px-4 py-1.5">{row.type_id===null ? "未設定" : typeNames.get(row.type_id) ?? "未設定"}</td><td className="whitespace-nowrap px-4 py-1.5 text-right">{row.amount===null ? "金額不明" : yen(row.amount)}</td><td className="px-4 py-1.5 text-center"><TransactionEditor cardId={account.id} types={types.data ?? []} transaction={row} date={row.date}/></td></tr>)}{!rows.length && <tr><td colSpan={7} className="p-8 text-center text-gray-500">対象期間の利用明細はありません。</td></tr>}</tbody>
    </table></section>
  </div></main>;
}
