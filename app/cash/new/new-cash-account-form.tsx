"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createCashAccount } from "../actions";

export default function NewCashAccountForm() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const pending = useRef(false), router = useRouter();
  const input = "mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-700";
  return <form className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800" onSubmit={async event => {
    event.preventDefault(); if (pending.current) return;
    const form = new FormData(event.currentTarget); pending.current = true; setBusy(true); setMessage("");
    try { const result = await createCashAccount(form); if (result.success && result.accountId) { router.push(`/cash/${result.accountId}`); router.refresh(); } else setMessage(result.message); }
    catch { setMessage("登録結果を確認できませんでした。現金口座設定を確認してください。"); }
    finally { pending.current = false; setBusy(false); }
  }}>
    <fieldset disabled={busy} className="space-y-5">
      <label className="block text-sm">口座名（必須）<input className={input} name="account_name" required maxLength={200} placeholder="例：財布、生活費の現金"/></label>
      <p className="text-xs text-gray-500 dark:text-gray-400">口座を区別する名前です。取引や振替の口座選択に表示されます。</p>
      <input type="hidden" name="bank_name" value=""/>
      <input type="hidden" name="branch_name" value=""/>
      <input type="hidden" name="account_holder" value=""/>
      <input type="hidden" name="opening_balance" value=""/>
      <input type="hidden" name="opening_balance_date" value=""/>
      <p className="text-sm text-gray-500 dark:text-gray-400">月初金額は0円で始まります。登録後の取引履歴で、月初金額と前月からの繰越金を設定できます。</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked/>利用中</label>
      <label className="block text-sm">メモ<textarea className={input} name="memo" rows={3} maxLength={5000}/></label>
      <div className="flex items-center gap-4"><button className="rounded-lg bg-indigo-600 px-5 py-2 text-sm text-white disabled:opacity-50" type="submit">{busy ? "登録しています…" : "口座を登録"}</button><Link href="/cash" className="text-sm text-gray-500">キャンセル</Link></div>
    </fieldset>
    {message && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{message}</p>}
  </form>;
}
