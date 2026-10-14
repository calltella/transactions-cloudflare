import BackToDashboard from "@/components/back-to-dashboard";
import FeatureIcon from "@/components/feature-icon";
import AccountOrder from "@/components/account-order";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserDatabase, UserAuthenticationError } from "@/src/lib/db/user";
import BankAccountForm from "./bank-account-form";

export const dynamic = "force-dynamic";

export default async function BankAccountsPage() {
  let context;
  try { context = await getUserDatabase(); }
  catch (error) { if (error instanceof UserAuthenticationError) redirect("/login"); throw error; }
  const { supabase, user } = context;
  const [methods, accounts] = await Promise.all([
    supabase.from("payment_methods").select("id,name").eq("type", "bank_account").order("name"),
    supabase.from("bank_accounts").select("*").eq("user_id", user.id).order("sort_order").order("id"),
  ]);
  return <main data-theme="bank" className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-8">
    <div className="max-w-2xl mx-auto space-y-6">
      <BackToDashboard/>
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="flex items-center gap-3 text-2xl font-bold"><FeatureIcon kind="bank"/>銀行口座設定</h1><Link href="/bank-accounts/new" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">銀行口座を登録</Link></div>
      {methods.error || accounts.error
        ? <p role="alert">銀行口座設定を取得できませんでした。bank_accountsテーブルの作成と読み取り権限を確認してください。</p>
        : <><AccountOrder kind="bank" items={(accounts.data ?? []).filter(a => (methods.data ?? []).some(m => m.id === a.payment_method_id)).map(item => ({ id: item.id, name: (methods.data ?? []).find(method => method.id === item.payment_method_id)?.name ?? "名称未設定" }))}/><BankAccountForm methods={methods.data ?? []} accounts={(accounts.data ?? []).filter(a => (methods.data ?? []).some(m => m.id === a.payment_method_id))} /></>}
    </div>
  </main>;
}
