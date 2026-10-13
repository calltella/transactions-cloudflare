import type { DashboardTransaction } from "./dashboard-calculations";

type Schedule = { closing_day: number | null; payment_day: number | null; payment_month_offset: number };

/** Payment due today is still upcoming; the data does not track settlement. */
export function nextCardPaymentPeriod(today: string, card: Schedule) {
  const { closing_day, payment_day, payment_month_offset } = card;
  if (closing_day === null || payment_day === null || !Number.isInteger(closing_day)
    || !Number.isInteger(payment_day) || closing_day < 0 || closing_day > 31
    || payment_day < 0 || payment_day > 31 || !Number.isInteger(payment_month_offset)
    || payment_month_offset < 0 || payment_month_offset > 32767) return null;
  const [year, month] = today.split("-").map(Number);
  const at = (offset: number, day: number) => {
    const last = new Date(Date.UTC(year, month + offset, 0)).getUTCDate();
    return new Date(Date.UTC(year, month - 1 + offset, day === 0 ? last : Math.min(day, last)));
  };
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const paymentOffset = iso(at(0, payment_day)) >= today ? 0 : 1;
  const due = iso(at(paymentOffset, payment_day));
  const closingOffset = paymentOffset - payment_month_offset;
  const end = iso(at(closingOffset, closing_day));
  if (end > due) return null;
  const start = at(closingOffset - 1, closing_day);
  start.setUTCDate(start.getUTCDate() + 1);
  return { start: iso(start), end, due, open: end > today };
}

/** Deferred statements belong to the cycle after the original closing date; usage dates stay intact. */
export function cardBillingDate(row: Pick<DashboardTransaction, "date" | "card_deferred">, closingDay: number | null) {
  if (!row.card_deferred || closingDay === null || closingDay < 0 || closingDay > 31) return row.date;
  const [year, month] = row.date.split("-").map(Number);
  const closing = (offset: number) => {
    const last = new Date(Date.UTC(year,month+offset,0)).getUTCDate();
    return new Date(Date.UTC(year,month-1+offset,closingDay === 0 ? last : Math.min(closingDay,last)));
  };
  let end = closing(0);
  if (end.toISOString().slice(0,10) < row.date) end = closing(1);
  end.setUTCDate(end.getUTCDate()+1);
  return end.toISOString().slice(0,10);
}

export function cardQueryStart(start: string) {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate()-32);
  return date.toISOString().slice(0,10);
}

export function cardPaymentAmount(rows: DashboardTransaction[], methodId: number,
  types: { id: number; name: string }[], period: { start: string; end: string }, today: string, closingDay: number | null = null) {
  const spendingTypes = new Set(types.filter(type => type.name === "支出").map(type => type.id));
  const sum = rows.reduce((total, row) => row.payment_method_id === methodId
    && row.type_id !== null && spendingTypes.has(row.type_id) && cardBillingDate(row,closingDay) >= period.start
    && cardBillingDate(row,closingDay) <= period.end && row.date <= today && row.amount !== null && Number.isSafeInteger(row.amount)
      ? total + row.amount : total, 0);
  return Math.max(0, sum);
}
