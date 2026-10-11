import Link from "next/link";
import NormalizeTypesButton from "./normalize-types-button";

import NormalizePaymentMethodsButton from "./normalize-payment-methods-button";

import NormalizeCategoriesButton from "./normalize-categories-button";

import InsertTransactionsButton from "./insert-transactions-button";

export default function DeveloperPage() {
  return (
    <main className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link href="/" className="text-indigo-600 hover:underline">ホームへ戻る</Link>
        <h1 className="text-2xl font-bold">開発画面</h1>
        <Link href="/developer/db-test" className="text-indigo-600 hover:underline">DB接続診断</Link>
        <NormalizeTypesButton />
        <NormalizePaymentMethodsButton />
        <NormalizeCategoriesButton />
        <InsertTransactionsButton />
      </div>
    </main>
  );
}
