"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CreditCardRow } from "@/src/lib/db/database.types";
import { saveCreditCard } from "./actions";

type Method = { id: number; name: string; type: string };
export default function CardForm({ methods, cards }: { methods: Method[]; cards: CreditCardRow[] }) {
  const positions = new Map(cards.map((item,index) => [item.payment_method_id,index]));
  const cardMethods = [...methods.filter(m => m.type === "credit_card")].sort((a,b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
  const accounts = methods.filter(m => m.type === "bank_account");
  const [selected, setSelected] = useState(String(cardMethods[0]?.id ?? ""));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const inFlight = useRef(false);
  const router = useRouter();
  const card = cards.find(c => String(c.payment_method_id) === selected);
  const inputClass = "block w-full mt-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = new FormData(event.currentTarget);
    inFlight.current = true; setBusy(true); setResult(null);
    try {
      const response = await saveCreditCard(form);
      setResult(response);
      if (response.success) router.refresh();
    } catch { setResult({ success: false, message: "保存結果を確認できませんでした。" }); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (!cardMethods.length) return <p>カードが登録されていません。支払方法の正規化後に設定してください。</p>;
  return <section className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 space-y-5">
    <label className="block text-sm font-medium">カード
      <select className={inputClass} value={selected} disabled={busy} onChange={e => { setSelected(e.target.value); setResult(null); }}>
        {cardMethods.map(m => <option key={m.id} value={m.id}>{m.name}{cards.some(c => c.payment_method_id === m.id) ? "（設定済み）" : "（未設定）"}</option>)}
      </select>
    </label>
    {card && <Link href={`/cards/${card.id}`} className="inline-block text-sm text-indigo-600 dark:text-indigo-300">利用明細を見る →</Link>}
    <form key={`${selected}:${card?.updated_at ?? "new"}`} onSubmit={submit} className="space-y-5">
      <fieldset disabled={busy} className="space-y-5">
        <input type="hidden" name="payment_method_id" value={selected} />
        <p className="text-sm text-gray-600 dark:text-gray-300">{card ? "保存済みの設定を編集します。" : "このカードの設定を新規登録します。"}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block text-sm">締め日
            <select className={inputClass} name="closing_day" defaultValue={card?.closing_day ?? ""}>
              <option value="">未設定</option>
              {Array.from({ length: 31 }, (_, index) => index + 1).map(day => <option key={day} value={day}>{day}日締め</option>)}
              <option value="0">月末締め</option>
            </select>
          </label>
          <label className="block text-sm">引き落とし日
            <select className={inputClass} name="payment_day" defaultValue={card?.payment_day ?? ""}>
              <option value="">未設定</option>
              {Array.from({ length: 31 }, (_, index) => index + 1).map(day => <option key={day} value={day}>{day}日</option>)}
              <option value="0">月末</option>
            </select>
          </label>
        </div>
        <label className="block text-sm">締め月から何か月後に引き落とすか
          <select className={inputClass} name="payment_month_offset" required defaultValue={card?.payment_month_offset ?? 1}>
            <option value="0">当月</option>
            <option value="1">翌月</option>
            <option value="2">翌々月</option>
            {Array.from({ length: 10 }, (_, index) => index + 3).map(month => <option key={month} value={month}>{month}か月後</option>)}
            {card && card.payment_month_offset > 12 && <option value={card.payment_month_offset}>{card.payment_month_offset}か月後（現在の設定）</option>}
          </select>
        </label>
        <label className="block text-sm">引き落とし口座<select className={inputClass} name="bank_account_payment_method_id" defaultValue={card?.bank_account_payment_method_id ?? ""}>
          <option value="">未設定</option>{accounts.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={card?.is_active ?? true} />利用中</label>
        <label className="block text-sm">メモ<textarea className={inputClass} name="memo" rows={3} maxLength={5000} defaultValue={card?.memo ?? ""} /></label>
        <button type="submit" className="rounded-lg bg-indigo-600 px-5 py-2 text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? "保存しています…" : "保存する"}</button>
      </fieldset>
      {result && <p role={result.success ? "status" : "alert"} className={result.success ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}>{result.message}</p>}
    </form>
  </section>;
}
