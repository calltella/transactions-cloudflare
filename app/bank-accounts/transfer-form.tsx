"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBankTransfer } from "./transfer-actions";

export default function TransferForm({ accounts, bankId, date }: { accounts: { id: number; name: string }[]; bankId: number; date: string }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [source, setSource] = useState(bankId);
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false), router = useRouter();
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  const input = "mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-700";
  return <div>
    <button type="button" disabled={accounts.length < 2} onClick={() => { setOpen(true); setSource(bankId); setMessage(""); }} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">口座間振替</button>
    {accounts.length < 2 && <p className="mt-1 text-xs text-gray-500">有効な口座を2つ以上登録してください。</p>}
    {open && <dialog aria-label="口座間振替" ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else setOpen(false); }} className="m-auto w-full max-w-xl border-0 bg-transparent p-4 backdrop:bg-black/40">
      <section className="rounded-xl bg-white p-6 text-gray-900 shadow-xl dark:bg-gray-800 dark:text-gray-100">
        <div className="mb-4 flex justify-between"><h2 className="text-lg font-bold">口座間振替</h2><button type="button" disabled={busy} onClick={() => setOpen(false)}>閉じる</button></div>
        <p className="mb-4 text-sm text-gray-500">振替元から出金し、振替先へ同額を入金します。収入・支出の集計には含めません。</p>
        <form className="space-y-4" onSubmit={async event => {
          event.preventDefault(); if (pending.current) return;
          const form = new FormData(event.currentTarget); pending.current = true; setBusy(true); setMessage("");
          try { const result = await createBankTransfer(form); setMessage(result.message); if (result.success) { setOpen(false); router.refresh(); } }
          catch { setMessage("振替の登録結果を確認できませんでした。履歴を確認してください。"); }
          finally { pending.current = false; setBusy(false); }
        }}>
          <fieldset disabled={busy} className="space-y-4">
            <label className="block text-sm">振替元<select className={input} name="source_bank_id" value={source} onChange={event => setSource(Number(event.target.value))}>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <label className="block text-sm">振替先<select key={source} className={input} name="destination_bank_id" required defaultValue=""><option value="">選択してください</option>{accounts.filter(account => account.id !== source).map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <label className="block text-sm">日付<input className={input} name="date" type="date" defaultValue={date} required/></label>
            <label className="block text-sm">金額（円）<input className={input} name="amount" type="number" min="1" max="2147483647" step="1" required/></label>
            <label className="block text-sm">メモ<input className={input} name="memo" maxLength={5000}/></label>
            <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50" type="submit">{busy ? "処理中…" : "振替を登録"}</button>
          </fieldset>
          {message && <p role="status" className="text-sm">{message}</p>}
        </form>
      </section>
    </dialog>}
    {!open && message && <p role="status" className="mt-2 text-xs">{message}</p>}
  </div>;
}
