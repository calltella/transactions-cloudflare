import assert from 'node:assert/strict';
import test from 'node:test';
import {loadModule} from './module-loader.mjs';

test('business days skip weekends, national holidays and substitute holidays',async()=>{
 const {adjustBusinessDay}=await loadModule('app/src/lib/db/business-day.ts',{});
 assert.equal(adjustBusinessDay('2026-05-05','previous'),'2026-05-01');
 assert.equal(adjustBusinessDay('2026-05-05','next'),'2026-05-07');
 assert.equal(adjustBusinessDay('2026-10-10','next'),'2026-10-13');
 assert.equal(adjustBusinessDay('2026-10-10','none'),'2026-10-10');
 assert.equal(adjustBusinessDay('2026-10-09','previous'),'2026-10-09');
 assert.throws(()=>adjustBusinessDay('2099-01-01','next'),/対象年外/);
});

test('period boundaries use adjusted starts across month and year boundaries',async()=>{
 const {dashboardPeriod}=await loadModule('app/src/lib/db/dashboard-period.ts',{});
 assert.deepEqual(dashboardPeriod('2025-05-30',1,0,'previous'),{start:'2025-05-30',end:'2025-06-30',today:'2025-05-30'});
 assert.deepEqual(dashboardPeriod('2026-05-06',5,0,'next'),{start:'2026-04-06',end:'2026-05-06',today:'2026-05-06'});
 assert.deepEqual(dashboardPeriod('2026-05-07',5,0,'next'),{start:'2026-05-07',end:'2026-06-04',today:'2026-05-07'});
 assert.deepEqual(dashboardPeriod('2026-01-01',1,0,'previous'),{start:'2025-12-31',end:'2026-01-29',today:'2026-01-01'});
});


test('adjusted monthly periods partition every day without gaps or overlap',async()=>{
 const {dashboardPeriod}=await loadModule('app/src/lib/db/dashboard-period.ts',{});
 const nextDay=iso=>{const day=new Date(`${iso}T00:00:00Z`);day.setUTCDate(day.getUTCDate()+1);return day.toISOString().slice(0,10)};
 for(const adjustment of ['previous','next'])for(const startDay of [1,5,25,31]) {
  for(let day='2026-01-01';day<'2027-01-01';day=nextDay(day)) {
   const period=dashboardPeriod(day,startDay,24,adjustment);
   assert.ok(period.start<=day&&day<=period.end,JSON.stringify(period));
   const next=dashboardPeriod(nextDay(period.end),startDay,24,adjustment);
   assert.equal(next.start,nextDay(period.end));
   assert.deepEqual(dashboardPeriod(period.end,startDay,24,adjustment),{...period,today:period.end});
  }
 }
});
