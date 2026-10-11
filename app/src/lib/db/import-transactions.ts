import { parseTransactionCsv } from "./csv";
import { withUserImportTransaction } from "./import-transaction";
import { transactionsWork } from "./schema";
import { eq, sql } from "drizzle-orm";

export async function importTransactionsCsv(csv: string) {
  // Validate the complete file before opening a database connection.
  const rows = parseTransactionCsv(csv);
  return withUserImportTransaction(async (tx, userId) => {
    // Serialize replacements for the same user; the lock expires with the transaction.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
    await tx.delete(transactionsWork).where(eq(transactionsWork.userId, userId));
    for (let start = 0; start < rows.length; start += 250) {
      const batch = rows.slice(start, start + 250).map((row) => ({
        userId,
        date: row.date,
        type: row.type,
        paymentMethod: row.payment_method,
        parentCategory: row.parent_category,
        childCategory: row.child_category,
        amount: row.amount,
        location: row.location,
        memo: row.memo,
        note: row.note,
        tag: row.tag,
      }));
      await tx.insert(transactionsWork).values(batch);
    }
    return { importedCount: rows.length };
  });
}
