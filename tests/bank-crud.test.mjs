import assert from 'node:assert/strict';
import test from 'node:test';
import {loadModule} from './module-loader.mjs';

for(const operation of ['create','update','delete'])test(`bank transaction ${operation} scopes writes to verified user and bank`,async()=>{
 const filters=[];let written;
 const chain={eq:(key,value)=>{filters.push([key,value]);return chain},select:()=>chain,maybeSingle:async()=>({data:{id:7},error:null}),single:async()=>({data:{id:7},error:null})};
 const module=await loadModule('app/bank-accounts/[id]/actions.ts',{
  'next/cache':{revalidatePath:()=>{}},
  '@/src/lib/db/user':{getUserDatabase:async()=>({user:{id:'verified'},supabase:{from:table=>{
   if(table==='bank_accounts')return {select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{payment_method_id:5},error:null})})})})};
   if(table==='transaction_types')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:2,name:'支出'},error:null})})})};
   assert.equal(table,'transactions');return {select:()=>({eq:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{id:7,transfer_id:null},error:null})})})})}),insert:values=>{written=values;return chain},update:values=>{written=values;return chain},delete:()=>chain};
  }}})}
 });
 const form=new FormData();for(const [key,value] of Object.entries({bank_id:'1',id:'7',operation,date:'2026-10-11',amount:'100',type_id:'2',memo:'メモ',location:'',note:'',tag:'',user_id:'forged',payment_method_id:'999'}))form.set(key,value);
 assert.equal((await module.mutateBankTransaction(form)).success,true);
 if(operation==='create'){assert.equal(written.user_id,'verified');assert.equal(written.payment_method_id,5)}
 else {assert.deepEqual(filters,[['id',7],['user_id','verified'],['payment_method_id',5]]);if(written)assert.equal(written.user_id,undefined)}
});

test('month navigation preserves nominal month across holiday adjustment',async()=>{
 const {monthPeriod,shiftMonth,dateWithWeekday}=await loadModule('app/src/lib/db/dashboard-period.ts',{});
 assert.equal(monthPeriod('2025-06',1,0,'previous').start,'2025-05-30');
 assert.equal(monthPeriod('2025-07',1,0,'previous').start,'2025-07-01');
 assert.equal(shiftMonth('2026-01',-1),'2025-12');
 assert.equal(dateWithWeekday('2026-10-11'),'2026-10-11（日）');
});
