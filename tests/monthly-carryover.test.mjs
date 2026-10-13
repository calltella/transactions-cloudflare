import assert from 'node:assert/strict';
import test from 'node:test';
import {loadModule} from './module-loader.mjs';

const bank={id:1,payment_method_id:5};
function database(saved,rows=[]) {
 return {from:table=>{
  const data=table==='bank_monthly_balances'?saved:table==='credit_cards'?[]:table==='transaction_types'?[{id:1,name:'収入'},{id:2,name:'支出'}]:rows;
  const chain={select:()=>chain,eq:()=>chain,lte:()=>chain,gte:()=>chain,in:()=>chain,order:()=>chain,limit:()=>chain,maybeSingle:async()=>({data,error:null}),range:async()=>({data,error:null}),then:(resolve)=>Promise.resolve({data,error:null}).then(resolve)};
  return chain;
 }};
}
test('carries previous closing balance across unsaved months without double counting',async()=>{
 const {resolveMonthlyBalance}=await loadModule('app/src/lib/db/resolve-monthly-balance.ts',{});
 const saved={month:'2026-08-01',opening_amount:0,carryover_amount:643144,opening_override:false};
 const rows=[{date:'2026-08-17',payment_method_id:5,type_id:2,amount:42990},{date:'2026-09-09',payment_method_id:5,type_id:1,amount:46144}];
 const result=await resolveMonthlyBalance(database(saved,rows),'user',bank,'2026-09',{month_start_day:15,month_end_day:14},'2026-10-14');
 assert.equal(result.carryover_amount,646298);assert.equal(result.automatic,true);
 const later=await resolveMonthlyBalance(database(saved,rows),'user',bank,'2026-10',{month_start_day:15,month_end_day:14},'2026-10-14');
 assert.equal(later.carryover_amount,646298);
});
test('current-month manual zero takes precedence and no baseline defaults to zero',async()=>{
 const {resolveMonthlyBalance}=await loadModule('app/src/lib/db/resolve-monthly-balance.ts',{});
 const saved={month:'2026-09-01',opening_amount:0,carryover_amount:1000,opening_override:true};
 const result=await resolveMonthlyBalance(database(saved),'user',bank,'2026-09',null,'2026-10-14');
 assert.equal(result.opening_override,true);assert.equal(result.opening_amount,0);assert.equal(result.automatic,false);
 assert.equal((await resolveMonthlyBalance(database(null),'user',bank,'2026-09',null,'2026-10-14')).carryover_amount,0);
});
