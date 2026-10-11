import { bigint, date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const transactionsWork = pgTable("transactions_work", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  userId: uuid("user_id").notNull().default(sql`auth.uid()`),
  date: date("date").notNull(),
  type: text("type").notNull(),
  paymentMethod: text("payment_method"),
  parentCategory: text("parent_category"),
  childCategory: text("child_category"),
  amount: integer("amount"),
  location: text("location"),
  memo: text("memo"),
  note: text("note"),
  tag: text("tag"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
