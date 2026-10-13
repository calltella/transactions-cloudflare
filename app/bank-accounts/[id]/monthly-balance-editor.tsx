"use client";
import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { saveMonthlyBalance } from "./monthly-balance-actions";

export default function MonthlyBalanceEditor({ bankId, month, opening, carryover, override = false, compact = false }: { bankId: number; month: string; opening: number; carryover: number; override?: boolean; compact?: boolean }) {
  const [open,setOpen] = useState(false), [busy,setBusy] = useState(false), [message,setMessage] = useState("");
  const [manual, setManual] = useState(override);
  const [carryText, setCarryText] = useState(String(carryover));
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false), router = useRouter();
  useEffect(() => { if (open) dialog.current?.showModal(); },[open]);
  const input = "mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-700";
  return <div className={compact ? "leading-none" : undefined}><button type="button" aria-label="月初金額・繰越金を編集" onClick={() => {setManual(override);setCarryText(String(carryover));setOpen(true);setMessage("");}} className={compact ? "inline-flex h-5 w-5 items-center justify-center rounded text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300" : "rounded-lg border border-indigo-200 px-3 py-2 text-sm text-indigo-700 dark:border-indigo-800 dark:text-indigo-300"}>{compact ? <Pencil size={18} aria-hidden="true"/> : "月初金額・繰越金"}</button>
    {open && <dialog ref={dialog} aria-label="月初金額・繰越金の設定" onCancel={event => {if(busy) event.preventDefault();else setOpen(false);}} className="m-auto w-full max-w-lg border-0 bg-transparent p-4 backdrop:bg-black/40">
      <section className="rounded-xl bg-white p-6 text-gray-900 shadow-xl dark:bg-gray-800 dark:text-gray-100">
        <div className="mb-4 flex justify-between gap-3"><h2 className="text-lg font-bold">{month} の月初金額・繰越金</h2><button type="button" disabled={busy} onClick={() => setOpen(false)}>閉じる</button></div>
        <form className="space-y-4" onSubmit={async event => {
          event.preventDefault();if(pending.current)return;
          const form = new FormData(event.currentTarget);pending.current=true;setBusy(true);setMessage("");
          try {const result=await saveMonthlyBalance(form);setMessage(result.message);if(result.success){setOpen(false);router.refresh();}}
          catch {setMessage("保存結果を確認できませんでした。");}
          finally {pending.current=false;setBusy(false);}
        }}>
          <input type="hidden" name="bank_id" value={bankId}/><input type="hidden" name="month" value={month}/>
          <fieldset disabled={busy} className="space-y-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="opening_override" checked={manual} onChange={event => setManual(event.target.checked)}/>月初金額を個別に指定する</label>
            <label className="block text-sm">月初金額（円）{manual ? <input className={input} name="opening_amount" type="number" step="1" min="-9007199254740991" max="9007199254740991" defaultValue={opening}/> : <input className={input} name="opening_amount" type="number" readOnly value={carryText || "0"}/>}</label>
            <p className="text-xs text-gray-500">個別指定しない場合は繰越金を月初金額に使います。未設定の翌月には月末残高を自動で繰り越します。</p>
            <label className="block text-sm">前月からの繰越金（円）<input className={input} name="carryover_amount" type="number" step="1" min="-9007199254740991" max="9007199254740991" value={carryText} onChange={event => setCarryText(event.target.value)}/></label>
            <p className="text-xs text-gray-500">個別指定した月初金額を優先し、繰越金は重ねて加算しません。</p>
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">{busy ? "保存中…" : "保存する"}</button>
          </fieldset>
          {message && <p role="status" className="text-sm">{message}</p>}
        </form>
      </section>
    </dialog>}
    {!open && message && <p role="status" className="mt-1 text-xs">{message}</p>}
  </div>;
}
