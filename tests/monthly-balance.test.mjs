import assert from 'node:assert/strict';
import test from 'node:test';
import {loadModule} from './module-loader.mjs';
const form = (overrides={}) => {const result=new FormData();for(const [key,value] of Object.entries({bank_id:'1',month:'2026-09',opening_amount:'0',carryover_amount:'1000',...overrides}))result.set(key,value);return result;};
test('monthly balances validate inputs and save per verified user, bank and month',async()=>{
 let saved;
 const module=await loadModule('app/bank-accounts/[id]/monthly-balance-actions.ts',{
  'next/cache':{revalidatePath:()=>{}},
  '@/src/lib/db/user': {
    getUserDatabase: async () => ({
      user: { id: 'verified' },
      supabase: {
        from: table => {
          const chain = { eq: () => chain, maybeSingle: async () => ({ data: { id: 1 }, error: null }) };
          if (table === 'bank_accounts') return { select: () => chain };
          return { upsert: values => {
            saved = values;
            return { select: () => ({ single: async () => ({ data: { bank_account_id: 1 }, error: null }) }) };
          } };
        }
      }
    })
  }
 });
 for(const overrides of [{month:'2026-13'},{opening_amount:'1.1'},{carryover_amount:'9007199254740992'},{bank_id:'0'}])assert.equal((await module.saveMonthlyBalance(form(overrides))).success,false);
 assert.equal(saved,undefined);
 assert.equal((await module.saveMonthlyBalance(form({user_id:'forged'}))).success,true);
 assert.equal(saved.user_id,'verified');assert.equal(saved.bank_account_id,1);assert.equal(saved.month,'2026-09-01');assert.equal(saved.opening_amount,0);assert.equal(saved.carryover_amount,1000);
 assert.equal((await module.saveMonthlyBalance(form({opening_amount:'',carryover_amount:''}))).success,true);assert.equal(saved.opening_amount,0);assert.equal(saved.carryover_amount,0);
});
test('opening uses carryover unless explicitly overridden, including explicit zero',async()=>{
 const {monthlyOpening}=await loadModule('app/src/lib/db/monthly-opening.ts',{});
 assert.equal(monthlyOpening(),0);
 assert.equal(monthlyOpening({opening_amount:0,carryover_amount:100000,opening_override:false}),100000);
 assert.equal(monthlyOpening({opening_amount:5000,carryover_amount:100000,opening_override:true}),5000);
 assert.equal(monthlyOpening({opening_amount:0,carryover_amount:100000,opening_override:true}),0);
});
