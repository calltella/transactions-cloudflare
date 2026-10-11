import Link from "next/link";
import MockPage from "@/components/mock-page";
export default function TransactionsPage() {
  return <MockPage title="取引一覧" description="日付・支払方法・カテゴリから取引を確認する画面です。">
    <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-gray-500">取引の検索・一覧表示は準備中です。</p><Link href="/transactions/import" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">CSVから取り込む</Link></div>
    <div className="mt-6 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-gray-200 dark:border-gray-700"><tr>{["日付", "内容", "支払方法", "カテゴリ", "金額"].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 font-medium text-gray-500">{label}</th>)}</tr></thead><tbody><tr><td colSpan={5} className="px-3 py-12 text-center text-gray-400">ここに取引が表示されます（モック）</td></tr></tbody></table></div>
  </MockPage>;
}
