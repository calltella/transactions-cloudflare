import { getUserDatabase, UserAuthenticationError } from "@/src/lib/db/user";
import { CsvValidationError, MAX_CSV_BYTES } from "@/src/lib/db/csv";
import { importTransactionsCsv } from "@/src/lib/db/import-transactions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const reply = (body: object, status: number) => Response.json(body, { status, headers });
  // Cookie-authenticated POSTs must originate from this app.
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return reply({ error: "許可されていない送信元です。" }, 403);
  }
  try {
    await getUserDatabase();
    if (!request.headers.get("Content-Type")?.startsWith("multipart/form-data;") || !request.body) {
      return reply({ error: "CSVファイルをfileフィールドで送信してください。" }, 400);
    }
    // Cap the entire multipart body before formData() allocates it.
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_CSV_BYTES + 64 * 1024) {
          await reader.cancel();
          return reply({ error: "CSVは最大1 MiBです。" }, 413);
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    let form: FormData;
    try {
      form = await new Response(body, { headers: { "Content-Type": request.headers.get("Content-Type")! } }).formData();
    } catch { return reply({ error: "ファイルの送信形式が不正です。" }, 400); }
    const file = form.get("file");
    if (!(file instanceof File)) return reply({ error: "CSVファイルが必要です。" }, 400);
    if (file.size > MAX_CSV_BYTES) return reply({ error: "CSVは最大1 MiBです。" }, 413);
    let csv: string;
    try { csv = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
    catch { return reply({ error: "CSVはUTF-8で保存してください。" }, 400); }
    return reply(await importTransactionsCsv(csv), 200);
  } catch (error) {
    if (error instanceof UserAuthenticationError) return reply({ error: error.message }, 401);
    if (error instanceof CsvValidationError) return reply({ error: error.message }, 400);
    return reply({ error: "CSVを取り込めませんでした。取引一覧を確認してください。" }, 500);
  }
}
