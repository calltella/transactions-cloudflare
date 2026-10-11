import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './module-loader.mjs';

test('dashboard periods handle cross-month periods, leap years and Japan dates', async () => {
 const {dashboardPeriod,todayInJapan}=await loadModule('app/src/lib/db/dashboard-period.ts',{});
 assert.deepEqual(dashboardPeriod('2026-01-10',25,24),{start:'2025-12-25',end:'2026-01-24',today:'2026-01-10'});
 assert.deepEqual(dashboardPeriod('2024-02-29',1,0),{start:'2024-02-01',end:'2024-02-29',today:'2024-02-29'});
 assert.deepEqual(dashboardPeriod('2026-02-28',31,30),{start:'2026-02-28',end:'2026-02-28',today:'2026-02-28'});
 assert.equal(todayInJapan(new Date('2026-10-10T16:00:00Z')),'2026-10-11');
});

test('dashboard excludes future and out-of-period charges, preserves refunds and baseline balances', async()=>{
 const {summarizeTransactions}=await loadModule('app/src/lib/db/dashboard-calculations.ts',{});
 const row=(date,id,type,amount)=>({date,payment_method_id:id,type_id:type,amount});
 const result=summarizeTransactions([
  row('2026-10-01',1,1,500),row('2026-10-05',1,2,200),row('2026-10-07',1,2,-50),
  row('2026-10-01',2,2,100),row('2026-10-10',2,2,300),row('2026-10-11',2,2,-20),
  row('2026-10-12',2,2,999),row('2026-10-11',2,99,30),row('2026-10-11',2,2,null)
 ],[{id:1,name:'収入'},{id:2,name:'支出'}],[{payment_method_id:1,opening_balance:1000,opening_balance_date:'2026-10-05'},{payment_method_id:3,opening_balance:null,opening_balance_date:null}],{start:'2026-10-05',end:'2026-11-04',today:'2026-10-11'});
 assert.equal(result.balances.get(1),850);assert.equal(result.balances.get(3),null);
 assert.equal(result.spending.get(2),280);assert.equal(result.unsupportedCount,1);assert.equal(result.missingAmountCount,1);
});

test('dashboard settings use verified ownership',async()=>{
 let saved;
 const module=await loadModule('app/settings/actions.ts',{
  'next/cache':{revalidatePath:()=>{}},
  '@/src/lib/db/user':{getUserDatabase:async()=>({user:{id:'verified'},supabase:{from:table=>{assert.equal(table,'dashboard_settings');return {upsert:values=>{saved=values;return {select:()=>({single:async()=>({data:{user_id:'verified'},error:null})})}}}}}})}
 });
 const form=new FormData();form.set('month_start_day','25');form.set('month_end_day','24');form.set('user_id','forged');
 assert.equal((await module.saveDashboardSettings(form)).success,true);assert.equal(saved.user_id,'verified');assert.equal(saved.month_start_day,25);
 form.set('month_start_day','0');assert.equal((await module.saveDashboardSettings(form)).success,false);
});
