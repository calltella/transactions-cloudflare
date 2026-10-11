"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { CsvValidationError, MAX_CSV_BYTES, parseTransactionCsv } from "@/src/lib/db/csv";
import type { TransactionInput } from "@/src/lib/db/database.types";

const template = "date,type,payment_method,parent_category,child_category,amount,location,memo,note,tag\r\n";
const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent("\uFEFF" + template)}`;

type Feedback = { kind: "success" | "error"; message: string; reauth?: boolean; uncertain?: boolean };

export default function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TransactionInput[]>([]);
  const [count, setCount] = useState(0);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const submissionInFlight = useRef(false);
  const selectionVersion = useRef(0);
  const busy = validating || submitting;

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    const version = ++selectionVersion.current;
    setFile(null);
    setPreview([]);
    setCount(0);
    setFeedback(null);
    setValidating(false);
    if (!selected) return;
    if (selected.size > MAX_CSV_BYTES) {
      setFeedback({ kind: "error", message: "CSVは最大1 MiBです。ファイルを分割してください。" });
      return;
    }
    setValidating(true);
    try {
      const bytes = await selected.arrayBuffer();
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const rows = parseTransactionCsv(text);
      if (version !== selectionVersion.current) return;
      setFile(selected);
      setPreview(rows.slice(0, 5));
      setCount(rows.length);
    } catch (error) {
      if (version === selectionVersion.current) {
        setFeedback({ kind: "error", message: error instanceof CsvValidationError
          ? error.message : "CSVを読み込めませんでした。UTF-8のCSVファイルを選択してください。" });
      }
    } finally {
      if (version === selectionVersion.current) setValidating(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy || feedback?.uncertain || submissionInFlight.current) return;
    submissionInFlight.current = true;
    setSubmitting(true);
    setFeedback(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/transactions/import", { method: "POST", body: form, credentials: "same-origin" });
      const body: unknown = await response.json();
      const result = body && typeof body === "object" ? body as { error?: unknown; importedCount?: unknown } : {};
      if (!response.ok) {
        setFeedback({ kind: "error", message: typeof result.error === "string" ? result.error : "取込に失敗しました。",
          reauth: response.status === 401, uncertain: response.status >= 500 });
        return;
      }
      if (result.importedCount !== count) throw new Error("Unexpected import result");
      setFeedback({ kind: "success", message: `${count.toLocaleString("ja-JP")}件の取引を取り込みました。` });
      setFile(null);
      setCount(0);
      setPreview([]);
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setFeedback({ kind: "error", message: "取込結果を確認できませんでした。", uncertain: true });
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 md:p-6 space-y-4">
        <h2 className="font-semibold">CSVの形式</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">UTF-8・カンマ区切り、最大1 MiB・5,000件。1行目に列名を指定してください。</p>
        <p className="text-sm"><code>date</code>（日付）と<code>type</code>（収入/支出）は必須です。<code>amount</code>（金額）は整数、空欄は未設定として扱います。</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">record.csvの日本語列名に対応しています。日付はYYYY-MM-DDまたはYYYY/MM/DD形式で、HH:mmの時刻がある場合は省略して日付だけを保存します。</p>
        <details className="text-sm text-gray-600 dark:text-gray-300">
          <summary className="cursor-pointer hover:underline">任意で指定できる列</summary>
          <p className="mt-2 break-words font-mono text-xs leading-6">payment_method, parent_category, child_category, amount, location, memo, note, tag</p>
          <p className="mt-2 text-xs leading-6">日本語列名：入金/支払方法、親カテゴリ、子カテゴリ、金額、場所、メモ、備考、タグ</p>
        </details>
        <a href={templateHref} download="transactions-template.csv" className="inline-block text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">CSVテンプレートをダウンロード</a>
      </section>

      <form onSubmit={submit} aria-busy={busy} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 md:p-6 space-y-5">
        <div className="space-y-2">
          <label htmlFor="csv-file" className="block font-semibold">CSVファイルを選択</label>
          <input ref={inputRef} id="csv-file" name="file" type="file" accept=".csv,text/csv" disabled={busy}
            onChange={selectFile} aria-describedby="csv-help" className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-indigo-700 dark:file:bg-indigo-950 dark:file:text-indigo-200 disabled:opacity-50" />
          <p id="csv-help" className="text-xs text-gray-500 dark:text-gray-400">所有者はログイン中のユーザーになります。id・user_id・created_atの列は指定できません。</p>
        </div>

        {validating && <p role="status" className="text-sm text-gray-600 dark:text-gray-300">ファイルを確認しています…</p>}
        {file && <section className="space-y-3">
          <h2 className="font-semibold break-all">{file.name} <span className="text-sm font-normal text-gray-500">（{count.toLocaleString("ja-JP")}件）</span></h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm text-left">
              <caption className="p-3 text-left text-xs text-gray-500 dark:text-gray-400">先頭{preview.length}件のプレビュー</caption>
              <thead className="bg-gray-50 dark:bg-gray-900"><tr>
                {["日付", "種別", "金額", "場所", "メモ"].map((label) => <th key={label} scope="col" className="px-3 py-2 whitespace-nowrap">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {preview.map((row, index) => <tr key={index}>
                  <td className="px-3 py-2 whitespace-nowrap">{row.date}</td>
                  <td className="px-3 py-2 max-w-40 break-words">{row.type}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{row.amount?.toLocaleString("ja-JP") ?? "—"}</td>
                  <td className="px-3 py-2 max-w-40 break-words">{row.location || "—"}</td>
                  <td className="px-3 py-2 max-w-64 break-words whitespace-pre-wrap">{row.memo || "—"}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>}

        {feedback && <div role={feedback.kind === "error" ? "alert" : "status"}
          className={`rounded-lg p-4 text-sm space-y-2 ${feedback.kind === "success" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200"}`}>
          <p>{feedback.message}</p>
          {feedback.reauth && <Link href="/login" className="font-medium underline">再度ログインしてください</Link>}
          {feedback.uncertain && <p>保存された可能性があります。再送する前に登録済みデータを確認してください。</p>}
        </div>}

        <p className="text-xs text-gray-500 dark:text-gray-400">あなたの既存のtransactions_workをすべて削除し、このCSVの内容に置き換えます。取込に失敗した場合は元のデータを保持します。</p>
        <button type="submit" disabled={!file || busy || !!feedback?.uncertain || !!feedback?.reauth}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">
          {submitting ? "取り込んでいます…" : count ? `${count.toLocaleString("ja-JP")}件を取り込む` : "取引を取り込む"}
        </button>
      </form>
    </div>
  );
}
