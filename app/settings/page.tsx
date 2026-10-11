import Link from "next/link";
import {redirect} from "next/navigation";
import {getUserDatabase,UserAuthenticationError} from "@/src/lib/db/user";
import SettingsForm from "./settings-form";
export const dynamic="force-dynamic";
export default async function SettingsPage(){
 let context;try{context=await getUserDatabase();}catch(error){if(error instanceof UserAuthenticationError)redirect("/login");throw error;}
 const {data,error}=await context.supabase.from("dashboard_settings").select("*").eq("user_id",context.user.id).maybeSingle();
 return <main className="bg-gray-50 px-4 py-10 text-gray-900 dark:bg-gray-900 dark:text-gray-100"><div className="mx-auto max-w-2xl space-y-6"><Link href="/" className="text-indigo-600 dark:text-indigo-400">ダッシュボードへ戻る</Link><h1 className="text-2xl font-bold">設定</h1>{error&&<p role="alert" className="text-sm text-rose-600">設定を取得できませんでした。ダッシュボード設定用SQLを適用してください。</p>}<section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"><SettingsForm start={data?.month_start_day??1} end={data?.month_end_day??0} adjustment={data?.month_start_holiday_adjustment??"none"}/></section></div></main>;
}
