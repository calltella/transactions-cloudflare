import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserDatabase, UserAuthenticationError } from "@/src/lib/db/user";
import NewBankAccountForm from "./new-bank-account-form";

export const dynamic = "force-dynamic";
export default async function NewBankAccountPage() {
  try { await getUserDatabase(); }
  catch (error) { if (error instanceof UserAuthenticationError) redirect("/login"); throw error; }
  return <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/bank-accounts" className="text-sm text-indigo-600 dark:text-indigo-300">← 銀行口座設定へ戻る</Link>
      <h1 className="text-2xl font-bold">銀行口座を登録</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">口座名と口座情報を登録します。登録後は取引や口座間振替に利用できます。</p>
      <NewBankAccountForm/>
    </div>
  </main>;
}
