"use client";
import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Database } from "@/src/lib/db/database.types";
import { mutateBankTransaction } from "./actions";
type Transaction = Database["public"]["Tables"]["transactions"]["Row"];

export default function TransactionEditor({ bankId, types, transaction, date }: {
  bankId: number; types: { id: number; name: string }[]; transaction?: Transaction; date: string;
}) {
  const [open, setOpen] = useState(false), [editing, setEditing] = useState(!transaction), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false), router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  async function run(form: FormData) {
    if (pending.current) return; pending.current = true; setBusy(true); setMessage("");
    try { const result = await mutateBankTransaction(form); setMessage(result.message); if (result.success) { setOpen(false); router.refresh(); } }
    catch { setMessage("操作結果を確認できませんでした。"); }
    finally { pending.current = false; setBusy(false); }
  }
  const input = "mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-700";
  return <div className={transaction ? "leading-none" : undefined}>
    <button type="button" aria-label={transaction ? "取引を編集" : "取引を追加"} title={transaction ? "取引を編集" : "取引を追加"} onClick={() => { setOpen(true); setEditing(!transaction?.transfer_id); setMessage(""); }} className={transaction ? "inline-flex h-5 w-5 items-center justify-center rounded-lg text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950" : "rounded-lg border border-indigo-200 px-3 py-2 text-sm text-indigo-700 dark:border-indigo-800 dark:text-indigo-300"}>{transaction ? <Pencil size={18} aria-hidden="true"/> : "取引を追加"}</button>
    {open && <dialog ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else setOpen(false); }} className="m-auto w-full max-w-xl border-0 bg-transparent p-4 backdrop:bg-black/40">
      <section role="dialog" aria-modal="true" aria-label={transaction ? "取引の詳細・編集" : "取引を追加"} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 text-left text-gray-900 shadow-xl dark:bg-gray-800 dark:text-gray-100">
        <div className="mb-5 flex justify-between gap-4"><h2 className="text-lg font-bold">{transaction ? editing ? "取引を編集" : "取引の詳細" : "取引を追加"}</h2><button autoFocus type="button" disabled={busy} onClick={() => setOpen(false)}>閉じる</button></div>
        <form onSubmit={event => { event.preventDefault(); void run(new FormData(event.currentTarget)); }} className="space-y-4">
          <input type="hidden" name="bank_id" value={bankId}/><input type="hidden" name="operation" value={transaction ? "update" : "create"}/>{transaction && <input type="hidden" name="id" value={transaction.id}/>}
          <fieldset disabled={busy || !editing} className="space-y-4">
            <div className="grid grid-cols-2 gap-4"><label className="text-sm">日付<input className={input} type="date" name="date" required defaultValue={transaction?.date ?? date}/></label><label className="text-sm">種別<select className={input} name="type_id" required defaultValue={transaction?.type_id ?? types.find(type => type.name === "支出")?.id ?? ""}><option value="">選択してください</option>{types.filter(type => ["収入", "支出"].includes(type.name)).map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label></div>
            <label className="block text-sm">金額（円）<input className={input} type="number" name="amount" step="1" min="-2147483648" max="2147483647" required defaultValue={transaction?.amount ?? ""}/></label>
            {(["memo", "location", "note", "tag"] as const).map((key, index) => <label key={key} className="block text-sm">{["メモ", "場所", "補足", "タグ"][index]}<input className={input} name={key} maxLength={5000} defaultValue={transaction?.[key] ?? ""}/></label>)}
          </fieldset>
          <div className="flex flex-wrap gap-3">{transaction?.transfer_id ? <p className="text-sm">振替を修正する場合は削除して再登録してください。</p> : editing ? <button type="submit" disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "処理中…" : "保存する"}</button> : <button type="button" onClick={() => setEditing(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">編集する</button>}
            {transaction && <button type="button" disabled={busy} className="rounded-lg border border-rose-300 px-4 py-2 text-sm text-rose-600" onClick={() => { if (!window.confirm(transaction.transfer_id ? "両口座の振替を削除しますか？" : "この取引を削除しますか？")) return; const form = new FormData(); form.set("bank_id", String(bankId)); form.set("id", String(transaction.id)); form.set("operation", "delete"); void run(form); }}>削除する</button>}
          </div>{message && <p role="status" className="text-sm">{message}</p>}
        </form>
      </section>
    </dialog>}
    {!open && message && <p role="status" className="mt-2 text-xs">{message}</p>}
  </div>;
}
