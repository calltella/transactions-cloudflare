import AccountOrder from "@/components/account-order";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserDatabase, UserAuthenticationError } from "@/src/lib/db/user";
import CardForm from "./card-form";

export const dynamic = "force-dynamic";

export default async function CardsPage() {
  let context;
  try { context = await getUserDatabase(); }
  catch (error) { if (error instanceof UserAuthenticationError) redirect("/login"); throw error; }
  const { supabase, user } = context;
  const [methods, cards] = await Promise.all([
    supabase.from("payment_methods").select("id,name,type").in("type", ["credit_card", "bank_account"]).order("name"),
    supabase.from("credit_cards").select("*").eq("user_id", user.id).order("sort_order").order("id"),
  ]);
  return <main className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-8">
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/" className="text-indigo-600 dark:text-indigo-400 hover:underline">ホームへ戻る</Link>
      <h1 className="text-2xl font-bold">カード設定</h1>
      {methods.error || cards.error
        ? <p role="alert">カード設定を取得できませんでした。credit_cardsテーブルと読み取り権限を確認してください。</p>
        : <><AccountOrder kind="card" items={(cards.data ?? []).map(item => ({ id: item.id, name: (methods.data ?? []).find(method => method.id === item.payment_method_id)?.name ?? "名称未設定" }))}/><CardForm methods={methods.data ?? []} cards={cards.data ?? []} /></>}
    </div>
  </main>;
}
