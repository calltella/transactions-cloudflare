export type BankHistoryEntry = {
  key: string;
  date: string;
  description: string;
  change: number | null;
  planned: boolean;
};

import { nextCardPaymentPeriod, cardPaymentAmount } from "./card-payment";
import type { CreditCardRow } from "./database.types";
import type { DashboardTransaction } from "./dashboard-calculations";

export function bankCardPayments(start: string, end: string, cards: CreditCardRow[]) {
  return cards.flatMap(card => {
    const periods = [];
    let cursor = start;
    while (cursor <= end) {
      const period = nextCardPaymentPeriod(cursor, card);
      if (!period || period.due > end) break;
      periods.push({ card, period });
      const next = new Date(`${period.due}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      cursor = next.toISOString().slice(0, 10);
    }
    return periods;
  });
}

export function plannedCardEntry(payment: ReturnType<typeof bankCardPayments>[number],
  rows: DashboardTransaction[], types: { id: number; name: string }[], name: string, today: string): BankHistoryEntry {
  const amount = cardPaymentAmount(rows, payment.card.payment_method_id, types, payment.period, today);
  const typeNames = new Map(types.map(type => [type.id, type.name]));
  const unknown = rows.some(row => row.payment_method_id === payment.card.payment_method_id
    && row.date >= payment.period.start && row.date <= payment.period.end && row.date <= today
    && (row.type_id === null || !["収入", "支出"].includes(typeNames.get(row.type_id) ?? "")
      || row.amount === null || !Number.isSafeInteger(row.amount)));
  return { key: `card-${payment.card.id}-${payment.period.due}`, date: payment.period.due,
    description: `${name} 引き落とし${payment.period.open ? "（締め日前・暫定）" : ""}`, change: unknown ? null : -amount, planned: true };
}

export function runningBankHistory(entries: BankHistoryEntry[], opening: number | null) {
  let cumulative = opening;
  return [...entries].sort((a, b) => a.date.localeCompare(b.date)
    || Number(a.planned) - Number(b.planned)
    || a.key.localeCompare(b.key, "en", { numeric: true })).map(entry => {
      if (entry.change === null) cumulative = null;
      else if (cumulative !== null) cumulative += entry.change;
      return { ...entry, cumulative };
    });
}
