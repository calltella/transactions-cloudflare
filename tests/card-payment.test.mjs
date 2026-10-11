import assert from 'node:assert/strict';
import test from 'node:test';
import {loadModule} from './module-loader.mjs';

test('next payment uses closing month and handles due-day boundaries',async()=>{
 const {nextCardPaymentPeriod}=await loadModule('app/src/lib/db/card-payment.ts',{});
 const card={closing_day:15,payment_day:10,payment_month_offset:1};
 assert.deepEqual(nextCardPaymentPeriod('2026-10-10',card),{start:'2026-08-16',end:'2026-09-15',due:'2026-10-10',open:false});
 assert.deepEqual(nextCardPaymentPeriod('2026-10-11',card),{start:'2026-09-16',end:'2026-10-15',due:'2026-11-10',open:true});
 assert.equal(nextCardPaymentPeriod('2026-10-11',{...card,payment_month_offset:0}),null);
 assert.equal(nextCardPaymentPeriod('2026-10-11',{...card,closing_day:null}),null);
});

test('month-end and two-month payments include leap dates and year rollover',async()=>{
 const {nextCardPaymentPeriod}=await loadModule('app/src/lib/db/card-payment.ts',{});
 assert.deepEqual(nextCardPaymentPeriod('2024-03-01',{closing_day:0,payment_day:27,payment_month_offset:1}),{start:'2024-02-01',end:'2024-02-29',due:'2024-03-27',open:false});
 assert.deepEqual(nextCardPaymentPeriod('2026-01-01',{closing_day:0,payment_day:0,payment_month_offset:2}),{start:'2025-11-01',end:'2025-11-30',due:'2026-01-31',open:false});
});

test('payment amount filters by card and billing cycle and subtracts refunds',async()=>{
 const {cardPaymentAmount}=await loadModule('app/src/lib/db/card-payment.ts',{});
 const row=(date,id,type,amount)=>({date,payment_method_id:id,type_id:type,amount});
 const types=[{id:1,name:'収入'},{id:2,name:'支出'}];
 const rows=[row('2026-09-15',5,2,999),row('2026-09-16',5,2,1000),row('2026-10-11',5,2,-200),row('2026-10-12',5,2,999),row('2026-10-11',6,2,999),row('2026-10-11',5,1,999)];
 assert.equal(cardPaymentAmount(rows,5,types,{start:'2026-09-16',end:'2026-10-15'},'2026-10-11'),800);
 assert.equal(cardPaymentAmount([row('2026-10-11',5,2,-200)],5,types,{start:'2026-09-16',end:'2026-10-15'},'2026-10-11'),0);
});
