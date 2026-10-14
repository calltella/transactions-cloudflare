"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BankAccountRow } from "@/src/lib/db/database.types";
import { saveCashAccount } from "./actions";

type Method = { id: number; name: string };
export default function CashAccountForm({ methods, accounts }: { methods: Method[]; accounts: BankAccountRow[] }) {
  const positions = new Map(accounts.map((item,index) => [item.payment_method_id,index]));
  const accountMethods = [...methods].sort((a,b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
  const [selected, setSelected] = useState(String(accountMethods[0]?.id ?? ""));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const inFlight = useRef(false);
  const router = useRouter();
  const account = accounts.find(c => String(c.payment_method_id) === selected);
  const inputClass = "block w-full mt-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = new FormData(event.currentTarget);
    inFlight.current = true; setBusy(true); setResult(null);
    try {
      const response = await saveCashAccount(form);
      setResult(response);
      if (response.success) router.refresh();
    } catch { setResult({ success: false, message: "保存結果を確認できませんでした。" }); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (!accountMethods.length) return <p>現金口座が登録されていません。「現金口座を登録」から追加してください。</p>;
  return <section className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 space-y-5">
    <label className="block text-sm font-medium">現金口座
      <select className={inputClass} value={selected} disabled={busy} onChange={e => { setSelected(e.target.value); setResult(null); }}>
        {accountMethods.map(m => <option key={m.id} value={m.id}>{m.name}{accounts.some(c => c.payment_method_id === m.id) ? "（設定済み）" : "（未設定）"}</option>)}
      </select>
    </label>
    <form key={`${selected}:${account?.updated_at ?? "new"}`} onSubmit={submit} className="space-y-5">
      <fieldset disabled={busy} className="space-y-5">
        <input type="hidden" name="payment_method_id" value={selected} />
        <p className="text-sm text-gray-600 dark:text-gray-300">{account ? "保存済みの設定を編集します。" : "この現金口座の設定を新規登録します。"}</p>
        <input type="hidden" name="bank_name" value=""/>
        <input type="hidden" name="branch_name" value=""/>
        <input type="hidden" name="account_holder" value=""/>
        <input type="hidden" name="opening_balance" value={account?.opening_balance ?? ""}/>
        <input type="hidden" name="opening_balance_date" value={account?.opening_balance_date ?? ""}/>
        <p className="text-sm text-gray-500 dark:text-gray-400">月初金額・繰越金は口座の取引履歴で対象月ごとに設定してください。</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={account?.is_active ?? true} />利用中</label>
        <label className="block text-sm">メモ<textarea className={inputClass} name="memo" rows={3} maxLength={5000} defaultValue={account?.memo ?? ""} /></label>
        <button type="submit" className="rounded-lg bg-indigo-600 px-5 py-2 text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? "保存しています…" : "保存する"}</button>
      </fieldset>
      {result && <p role={result.success ? "status" : "alert"} className={result.success ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}>{result.message}</p>}
    </form>
  </section>;
}
