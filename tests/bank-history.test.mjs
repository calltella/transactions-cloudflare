import assert from 'node:assert/strict';
import test from 'node:test';
import {loadModule} from './module-loader.mjs';

test('bank history sorts ascending and accumulates from opening balance',async()=>{
 const {runningBankHistory}=await loadModule('app/src/lib/db/bank-history.ts',{});
 const entry=(key,date,change,planned=false)=>({key,date,change,planned,description:key});
 const result=runningBankHistory([entry('transaction-12','2026-10-02',-200),entry('card-1','2026-10-02',-300,true),entry('transaction-2','2026-10-02',50),entry('transaction-1','2026-10-01',100)],1000);
 assert.deepEqual(result.map(row=>row.key),['transaction-1','transaction-2','transaction-12','card-1']);
 assert.deepEqual(result.map(row=>row.cumulative),[1100,1150,950,650]);
 assert.equal(runningBankHistory([entry('unknown','2026-10-01',null),entry('known','2026-10-02',10)],100)[1].cumulative,null);
 assert.equal(runningBankHistory([entry('known','2026-10-02',10)],null)[0].cumulative,null);
});

test('history includes all card withdrawals in month, not individual purchases',async()=>{
 const {bankCardPayments,plannedCardEntry}=await loadModule('app/src/lib/db/bank-history.ts',{});
 const card={id:1,payment_method_id:5,closing_day:0,payment_day:27,payment_month_offset:1};
 const payments=bankCardPayments('2026-09-25','2026-10-29',[card]);
 assert.deepEqual(payments.map(p=>p.period.due),['2026-09-27','2026-10-27']);
 const rows=[{date:'2026-09-01',payment_method_id:5,type_id:2,amount:1000},{date:'2026-09-30',payment_method_id:5,type_id:2,amount:-100},{date:'2026-10-01',payment_method_id:5,type_id:2,amount:800}];
 const entry=plannedCardEntry(payments[1],rows,[{id:2,name:'支出'}],'カード','2026-10-11');
 assert.equal(entry.date,'2026-10-27');assert.equal(entry.change,-900);assert.equal(entry.planned,true);
});
