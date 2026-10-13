export function bankAccountInput(form: FormData) {
    const text = (key: string, max: number) => {
      const value = form.get(key);
      if (typeof value !== "string" || value.length > max) throw new Error("invalid");
      return value.trim() || null;
    };
    const balance = form.get("opening_balance");
    if (typeof balance !== "string" || (balance !== "" && !/^-?\d+$/.test(balance))) throw new Error("invalid");
    const opening_balance = balance === "" ? null : Number(balance);
    if (opening_balance !== null && !Number.isSafeInteger(opening_balance)) throw new Error("invalid");
    const opening_balance_date = text("opening_balance_date", 10);
    if ((opening_balance === null) !== (opening_balance_date === null)) throw new Error("invalid");
    if (opening_balance_date && (!/^\d{4}-\d{2}-\d{2}$/.test(opening_balance_date)
      || opening_balance_date.startsWith("0000")
      || !Number.isFinite(Date.parse(opening_balance_date))
      || new Date(opening_balance_date).toISOString().slice(0, 10) !== opening_balance_date)) throw new Error("invalid");
    return { bank_name: text("bank_name", 200), branch_name: text("branch_name", 200),
      account_holder: text("account_holder", 200), opening_balance, opening_balance_date,
      is_active: form.get("is_active") === "on", memo: text("memo", 5000) };
}
