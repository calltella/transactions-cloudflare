export function monthlyOpening(balance?: { opening_amount: number; carryover_amount: number; opening_override: boolean } | null) {
  return balance ? balance.opening_override ? balance.opening_amount : balance.carryover_amount : 0;
}
