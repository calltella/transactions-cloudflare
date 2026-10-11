"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import type {HolidayAdjustment} from "@/src/lib/db/business-day";
import {saveDashboardSettings} from "./actions";
export default function SettingsForm({start,end,adjustment}:{start:number;end:number;adjustment:HolidayAdjustment}) {
 const [busy,setBusy]=useState(false),[result,setResult]=useState<{success:boolean;message:string}|null>(null);
 const [holidayAdjustment,setHolidayAdjustment]=useState<HolidayAdjustment>(adjustment);
 const pending=useRef(false),router=useRouter();
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending.current)return;const form=new FormData(event.currentTarget);
  pending.current=true;setBusy(true);setResult(null);
  try{const response=await saveDashboardSettings(form);setResult(response);if(response.success)router.refresh();}
  catch{setResult({success:false,message:"保存結果を確認できませんでした。"});}finally{pending.current=false;setBusy(false);}
 }
 return <form onSubmit={submit} className="space-y-5"><fieldset disabled={busy} className="space-y-5">
 <h2 className="font-semibold">月の集計期間</h2><p className="text-sm text-gray-500 dark:text-gray-400">家計の月の集計期間を設定します。カードの次回支払額は各カードの締め日・支払日から別に計算します。終了日が開始日より前の場合は翌月まで集計します。存在しない日は月末に合わせます。</p>
 <div className="grid grid-cols-2 gap-4">{[{name:"month_start_day",label:"開始日",value:start},{name:"month_end_day",label:"終了日",value:end}].map(field=><label key={field.name} className="text-sm">{field.label}<select name={field.name} defaultValue={field.value} disabled={field.name==="month_end_day"&&holidayAdjustment!=="none"} className="mt-2 block w-full rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-700">{Array.from({length:31},(_,i)=>i+1).map(day=><option key={day} value={day}>{day}日</option>)}{field.name==="month_end_day"&&<option value="0">月末</option>}</select></label>)}</div>
 <label className="block text-sm">開始日が休日の場合<select name="month_start_holiday_adjustment" value={holidayAdjustment} onChange={event=>setHolidayAdjustment(event.target.value as HolidayAdjustment)} className="mt-2 block w-full rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-700"><option value="none">調整しない</option><option value="previous">前の平日</option><option value="next">次の平日</option></select></label><p className="text-xs text-gray-500 dark:text-gray-400">土日と日本の祝日・振替休日が対象です。休日調整を選んだ場合、終了日は翌月の調整済み開始日の前日になります。</p>
 {holidayAdjustment!=="none"&&<><input type="hidden" name="month_end_day" value={end}/><p className="text-sm text-indigo-600 dark:text-indigo-300">終了日は自動計算します。月ごとの期間は重複せず、連続します。</p></>}
 <button type="submit" className="rounded-lg bg-indigo-600 px-5 py-2 text-sm text-white disabled:opacity-50">{busy?"保存しています…":"保存する"}</button></fieldset>
 {result&&<p role={result.success?"status":"alert"} className="text-sm">{result.message}</p>}</form>;
}
