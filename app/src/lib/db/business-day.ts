import { holidayDates } from "./japan-holidays";

export type HolidayAdjustment = "none" | "previous" | "next";
const holidays = new Set<string>(holidayDates);
const firstYear = Number(holidayDates[0].slice(0, 4));
export const holidayLastYear = Number(holidayDates[holidayDates.length - 1].slice(0, 4));

export function adjustBusinessDay(date: string, adjustment: HolidayAdjustment) {
  if (adjustment === "none") return date;
  const value = new Date(`${date}T00:00:00Z`);
  for (let count = 0; count < 31; count++) {
    const year = value.getUTCFullYear();
    if (year < firstYear || year > holidayLastYear) throw new Error("祝日データの対象年外です。祝日データを更新してください。");
    const iso = value.toISOString().slice(0, 10);
    const weekday = value.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holidays.has(iso)) return iso;
    value.setUTCDate(value.getUTCDate() + (adjustment === "previous" ? -1 : 1));
  }
  throw new Error("開始日の休日調整を計算できませんでした。");
}
