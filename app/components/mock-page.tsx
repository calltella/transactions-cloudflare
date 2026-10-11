import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export default async function MockPage({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  const supabase = createClient(await cookies());
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  return <main className="bg-gray-50 dark:bg-gray-900 px-4 py-10 text-gray-900 dark:text-gray-100">
    <div className="mx-auto max-w-5xl space-y-6">
      <div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">準備中・モック画面</span><h1 className="mt-4 text-3xl font-bold">{title}</h1><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{description}</p></div>
      <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">{children ?? <p className="text-sm text-gray-500 dark:text-gray-400">この画面の機能は今後追加します。</p>}</section>
      <Link href="/" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">ホームへ戻る</Link>
    </div>
  </main>;
}
