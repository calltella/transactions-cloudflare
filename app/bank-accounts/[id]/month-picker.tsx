"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function MonthPicker({ month }: { month: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div aria-busy={pending}>
    <input aria-label="対象月" type="month" name="month" value={month} min="1956-01" max="9998-12" disabled={pending}
      onChange={event => {
        const selected = event.currentTarget.value;
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected) || selected < "1956-01" || selected > "9998-12") return;
        startTransition(() => router.push(`?month=${selected}`));
      }}
      className="rounded-lg border border-gray-300 bg-white p-2 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800"/>
  </div>;
}
