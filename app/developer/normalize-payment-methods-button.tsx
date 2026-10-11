"use client";

import { useRef, useState } from "react";
import { normalizePaymentMethods, type NormalizePaymentMethodsResult } from "./normalize-payment-methods-actions";

export default function NormalizePaymentMethodsButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<NormalizePaymentMethodsResult | null>(null);
  const inFlight = useRef(false);

  async function run() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setResult(null);
    try { setResult(await normalizePaymentMethods()); }
    catch { setResult({ success: false, message: "実行結果を確認できませんでした。" }); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
      <h2 className="font-semibold">payment_methodの正規化</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300">全ユーザーのtransactionsをすべて削除した後、payment_methodsを全件削除し、あなたのtransactions_workのpayment_methodを重複なしで登録し直します。</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">銀行を含む名称はbank_account、カードを含む名称はcredit_card、それ以外はotherで登録します。空欄は除外し、元のtransactions_workは保持します。</p>
      <button type="button" onClick={run} disabled={busy}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
        {busy ? "正規化しています…" : "payment_methodを正規化"}
      </button>
      {result && <p role={result.success ? "status" : "alert"}
        className={`text-sm ${result.success ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>{result.message}</p>}
    </section>
  );
}
