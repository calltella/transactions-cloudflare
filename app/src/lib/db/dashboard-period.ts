import { adjustBusinessDay, type HolidayAdjustment } from "./business-day";

export function todayInJapan(now = new Date()) {
 const parts = new Intl.DateTimeFormat("en-US", { timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit" }).formatToParts(now);
 const get=(key:string)=>parts.find(p=>p.type===key)!.value;
 return `${get("year")}-${get("month")}-${get("day")}`;
}
export function dashboardPeriod(today:string,startDay:number,endDay:number,adjustment:HolidayAdjustment="none") {
 const [year,month]=today.split("-").map(Number);
 const at=(offset:number,day:number)=> {
  const last=new Date(Date.UTC(year,month+offset,0)).getUTCDate();
  return new Date(Date.UTC(year,month-1+offset,day===0?last:Math.min(day,last))).toISOString().slice(0,10);
 };
 // A next month's nominal start can move into this month when moving backwards.
 let offset=1;
 while(adjustBusinessDay(at(offset,startDay),adjustment)>today)offset--;
 const start=adjustBusinessDay(at(offset,startDay),adjustment);
 if(adjustment!=="none") {
  const nextStart=adjustBusinessDay(at(offset+1,startDay),adjustment);
  const last=new Date(`${nextStart}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate()-1);
  return {start,end:last.toISOString().slice(0,10),today};
 }
 let end=at(offset,endDay);
 if(end<start)end=at(offset+1,endDay);
 return {start,end,today};
}

export function monthPeriod(month: string, startDay: number, endDay: number, adjustment: HolidayAdjustment = "none") {
 const [year, number] = month.split("-").map(Number);
 const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
 const nominal = new Date(Date.UTC(year, number - 1, Math.min(startDay, last))).toISOString().slice(0, 10);
 return dashboardPeriod(adjustBusinessDay(nominal, adjustment), startDay, endDay, adjustment);
}

export function shiftMonth(month: string, offset: number) {
 const [year, number] = month.split("-").map(Number);
 return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function dateWithWeekday(date: string) {
 return `${date}（${["日", "月", "火", "水", "木", "金", "土"][new Date(`${date}T00:00:00Z`).getUTCDay()]}）`;
}
