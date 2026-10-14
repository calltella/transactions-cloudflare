import BackToDashboard from "@/components/back-to-dashboard";
import FeatureIcon from "@/components/feature-icon";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import ImportForm from "./import-form";

export const dynamic = "force-dynamic";

export default async function TransactionImportPage() {
  const supabase = createClient(await cookies());
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  return (
    <main data-theme="import" className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <BackToDashboard/>
        <header className="space-y-2">
          <h1 className="flex items-center gap-3 text-2xl font-bold"><FeatureIcon kind="import"/>CSVから取引を取り込む</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">CSVファイルの内容を確認して、あなたの取引として登録します。</p>
        </header>
        <ImportForm />
      </div>
    </main>
  );
}
