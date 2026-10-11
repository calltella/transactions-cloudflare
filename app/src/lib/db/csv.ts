import type { TransactionInput } from "./database.types";

export const MAX_CSV_BYTES = 1024 * 1024;
export const MAX_CSV_ROWS = 5000;

export class CsvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvValidationError";
  }
}

const headerAliases = new Map<string, string>([
  ["日付", "date"], ["収入/支出", "type"], ["入金/支払方法", "payment_method"],
  ["親カテゴリ", "parent_category"], ["子カテゴリ", "child_category"], ["金額", "amount"],
  ["場所", "location"], ["メモ", "memo"], ["備考", "note"], ["タグ", "tag"],
]);

function normalizeDate(value: string): string | undefined {
  // Discard wall-clock time without converting the date to another timezone.
  const match = /^(\d{4})([-/])(\d{2})\2(\d{2})(?: ([01]\d|2[0-3]):([0-5]\d))?$/.exec(value.trim());
  if (!match || match[1] === "0000") return undefined;
  const date = `${match[1]}-${match[3]}-${match[4]}`;
  const parsed = new Date(date + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : undefined;
}

/** Comma-separated UTF-8 CSV, including escaped quotes and quoted newlines. */
function parseRecords(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  const finishField = () => { row.push(field); field = ""; closedQuote = false; };
  const finishRow = () => {
    finishField();
    if (!(row.length === 1 && row[0].trim() === "")) rows.push(row);
    row = [];
    if (rows.length > MAX_CSV_ROWS + 1) throw new CsvValidationError("CSVは最大5000行です。");
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closedQuote = true; }
      } else field += char;
    } else if (char === ",") finishField();
    else if (char === "\n" || char === "\r") {
      finishRow();
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else if (closedQuote) {
      throw new CsvValidationError("CSVの引用符の後に不正な文字があります。");
    } else if (char === '"') {
      if (field) throw new CsvValidationError("CSVの引用符の位置が不正です。");
      quoted = true;
    } else field += char;
  }
  if (quoted) throw new CsvValidationError("CSVの引用符が閉じていません。");
  if (field || row.length || closedQuote) finishRow();
  return rows;
}

export function parseTransactionCsv(text: string): TransactionInput[] {
  if (new TextEncoder().encode(text).byteLength > MAX_CSV_BYTES) {
    throw new CsvValidationError("CSVは最大1 MiBです。");
  }
  const [rawHeaders, ...records] = parseRecords(text);
  if (!rawHeaders || !records.length) throw new CsvValidationError("ヘッダーと取引データが必要です。");
  const headers = rawHeaders.map((header) => headerAliases.get(header.trim()) ?? header.trim());
  const allowed = ["date", "type", "payment_method", "parent_category", "child_category",
    "amount", "location", "memo", "note", "tag"];
  if (new Set(headers).size !== headers.length || headers.some((header) => !allowed.includes(header)) ||
      !headers.includes("date") || !headers.includes("type")) {
    throw new CsvValidationError("CSVの列名を確認してください。date（日付）とtype（収入/支出）は必須です。id、user_id、created_atは指定できません。");
  }
  return records.map((fields, index) => {
    const line = index + 2;
    if (fields.length !== headers.length) throw new CsvValidationError(`${line}件目の列数が一致しません。`);
    const record = Object.fromEntries(headers.map((header, i) => [header, fields[i]]));
    const date = normalizeDate(record.date);
    const type = record.type.trim();
    if (!date || !type) {
      throw new CsvValidationError(`${line}件目の日付（YYYY-MM-DD / YYYY/MM/DD HH:mm）または収入/支出が不正です。`);
    }
    const result: TransactionInput = { date, type };
    for (const key of headers) {
      if (key === "date" || key === "type") continue;
      if (key === "amount") {
        const value = record.amount.trim();
        if (value && (!/^[+-]?\d+$/.test(value) || !Number.isSafeInteger(Number(value)) ||
            Number(value) < -2147483648 || Number(value) > 2147483647)) {
          throw new CsvValidationError(`${line}件目のamountは32ビット整数で指定してください。`);
        }
        result.amount = value ? Number(value) : null;
      } else {
        const column = key as Exclude<keyof TransactionInput, "date" | "type" | "amount">;
        result[column] = record[key] === "" ? null : record[key];
      }
    }
    return result;
  });
}
