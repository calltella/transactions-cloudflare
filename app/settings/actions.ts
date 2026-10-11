"use server";
import { revalidatePath } from "next/cache";
import { getUserDatabase } from "@/src/lib/db/user";
export async function saveDashboardSettings(form:FormData) {
 const adjustment=form.get("month_start_holiday_adjustment") ?? "none";
 if(adjustment!=="none"&&adjustment!=="previous"&&adjustment!=="next")return {success:false,message:"休日の調整方法を選択してください。"};
 const start=form.get("month_start_day"),end=form.get("month_end_day");
 if(typeof start!=="string"||typeof end!=="string"||!/^\d+$/.test(start)||!/^\d+$/.test(end)||Number(start)<1||Number(start)>31||Number(end)<0||Number(end)>31)return {success:false,message:"開始日・終了日を選択してください。"};
 try {
  const {supabase,user}=await getUserDatabase();
  const {data,error}=await supabase.from("dashboard_settings").upsert({user_id:user.id,month_start_day:Number(start),month_end_day:Number(end),month_start_holiday_adjustment:adjustment,updated_at:new Date().toISOString()}).select("user_id").single();
  if(error||!data)return {success:false,message:"保存できませんでした。ダッシュボード設定用SQLを適用してください。"};
  revalidatePath("/");revalidatePath("/settings");return {success:true,message:"集計期間を保存しました。"};
 }catch{return {success:false,message:"保存できませんでした。ログイン状態と接続を確認してください。"};}
}
