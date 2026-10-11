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
    supabase.from("bank_accounts").select("*").eq("user_id", user.id).order("id"),
  ]);
  return <main className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-8">
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/" className="text-indigo-600 dark:text-indigo-400 hover:underline">ホームへ戻る</Link>
      <h1 className="text-2xl font-bold">銀行口座設定</h1>
      {methods.error || accounts.error
        ? <p role="alert">銀行口座設定を取得できませんでした。bank_accountsテーブルの作成と読み取り権限を確認してください。</p>
        : <BankAccountForm methods={methods.data ?? []} accounts={accounts.data ?? []} />}
    </div>
  </main>;
}
