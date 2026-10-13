"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { saveAccountOrder } from "./account-order-actions";

type Item = { id: number; name: string };
export default function AccountOrder({ kind, items }: { kind: "bank" | "card"; items: Item[] }) {
  const [open, setOpen] = useState(false), [order, setOrder] = useState(items), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const pending = useRef(false), dialog = useRef<HTMLDialogElement>(null), router = useRouter();
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  if (items.length < 2) return null;
  function move(index: number, offset: number) {
    setOrder(current => { const next = [...current]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; return next; });
  }
  return <div>
    <button type="button" onClick={() => { setOrder(items); setMessage(""); setOpen(true); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600">並び替え</button>
    {open && <dialog aria-label={`${kind === "bank" ? "銀行口座" : "クレジットカード"}の並び替え`} ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else setOpen(false); }} className="m-auto w-full max-w-lg border-0 bg-transparent p-4 backdrop:bg-black/40">
      <section className="max-h-[90dvh] overflow-y-auto rounded-xl bg-white p-6 text-gray-900 shadow-xl dark:bg-gray-800 dark:text-gray-100">
        <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-bold">{kind === "bank" ? "銀行口座" : "クレジットカード"}の並び替え</h2><button type="button" disabled={busy} onClick={() => setOpen(false)}>閉じる</button></div>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">上下ボタンで順序を変更し、保存してください。</p>
        <ol className="my-5 space-y-2">{order.map((item,index) => <li key={item.id} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"><span className="min-w-0 flex-1 break-words text-sm">{item.name}</span><button type="button" aria-label={`${item.name}を上へ`} disabled={busy || index === 0} onClick={() => move(index,-1)} className="rounded border p-2 disabled:opacity-30"><ArrowUp size={16}/></button><button type="button" aria-label={`${item.name}を下へ`} disabled={busy || index === order.length-1} onClick={() => move(index,1)} className="rounded border p-2 disabled:opacity-30"><ArrowDown size={16}/></button></li>)}</ol>
        <button type="button" disabled={busy} onClick={async () => {
          if (pending.current) return; pending.current = true; setBusy(true); setMessage("");
          try { const result = await saveAccountOrder(kind, order.map(item => item.id)); setMessage(result.message); if (result.success) { setOpen(false); router.refresh(); } }
          catch { setMessage("保存結果を確認できませんでした。画面を更新してください。"); }
          finally { pending.current = false; setBusy(false); }
        }} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "保存中…" : "並び順を保存"}</button>
        {message && <p role="status" className="mt-3 text-sm">{message}</p>}
      </section>
    </dialog>}
    {!open && message && <p role="status" className="mt-1 text-xs">{message}</p>}
  </div>;
}
