"use client";

import { useRef, useState } from "react";
import { insertNormalizedTransactions, type InsertTransactionsResult } from "./insert-transactions-actions";

export default function InsertTransactionsButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InsertTransactionsResult | null>(null);
  const inFlight = useRef(false);

  async function run() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setResult(null);
    try { setResult(await insertNormalizedTransactions()); }
    catch { setResult({ success: false, message: "実行結果を確認できませんでした。" }); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
      <h2 className="font-semibold">transactionsへの登録</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300">あなたのtransactions_workを、正規化済みのtype・支払方法・親子カテゴリのIDに対応させてtransactionsへ登録します。</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">元のtransactions_workは保持します。対応するIDがない場合や、あなたのtransactionsに既存データがある場合は登録を中止します。</p>
      <button type="button" onClick={run} disabled={busy}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
        {busy ? "登録しています…" : "transactionsへ登録"}
      </button>
      {result && <p role={result.success ? "status" : "alert"}
        className={`text-sm ${result.success ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>{result.message}</p>}
    </section>
  );
}
