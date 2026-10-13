export type DashboardTransaction = { date: string; payment_method_id: number | null; type_id: number | null; amount: number | null; transfer_id?: string | null; card_deferred?: boolean };

export function summarizeTransactions(
  rows: DashboardTransaction[], types: { id: number; name: string }[],
  banks: { payment_method_id: number; opening_balance: number | null; opening_balance_date: string | null }[],
  period: { start: string; end: string; today: string },
) {
  const typeNames = new Map(types.map(type => [type.id, type.name]));
  const spending = new Map<number, number>();
  const balances = new Map<number, number | null>(banks.map(bank => [bank.payment_method_id,
    bank.opening_balance !== null && bank.opening_balance_date !== null && bank.opening_balance_date <= period.today ? bank.opening_balance : null]));
  const baselines = new Map(banks.map(bank => [bank.payment_method_id, bank.opening_balance_date]));
  let unsupportedCount = 0;
  let missingAmountCount = 0;
  for (const row of rows) {
    if (row.date > period.today) continue;
    const name = row.type_id === null ? undefined : typeNames.get(row.type_id);
    if (name !== "収入" && name !== "支出") { unsupportedCount++; continue; }
    if (row.amount === null || !Number.isSafeInteger(row.amount)) { missingAmountCount++; continue; }
    if (row.payment_method_id === null) continue;
    const id = row.payment_method_id;
    if (!row.transfer_id && name === "支出" && row.date >= period.start && row.date <= period.end) {
      spending.set(id, (spending.get(id) ?? 0) + row.amount);
    }
    const balance = balances.get(id);
    const baseline = baselines.get(id);
    if (balance !== undefined && balance !== null && baseline && row.date >= baseline) {
      balances.set(id, balance + (name === "収入" ? row.amount : -row.amount));
    }
  }
  return { spending, balances, unsupportedCount, missingAmountCount };
}
