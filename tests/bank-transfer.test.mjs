import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './module-loader.mjs';

const form = (changes = {}) => {
 const data = new FormData();
 for (const [key,value] of Object.entries({source_bank_id:'1',destination_bank_id:'2',amount:'3000',date:'2026-10-14',memo:'移動',...changes})) data.set(key,value);
 return data;
};
test('transfer validates input and passes only verified parameters to atomic RPC', async () => {
 const calls = [];
 const module = await loadModule('app/bank-accounts/transfer-actions.ts', {
  'next/cache': {revalidatePath:()=>{}},
  '@/src/lib/db/user': {getUserDatabase:async()=>({supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:'uuid',error:null}}}})}
 });
 for (const changes of [{destination_bank_id:'1'},{amount:'0'},{amount:'-1'},{amount:'1.5'},{amount:'2147483648'},{date:'2026-02-30'},{memo:'a'.repeat(5001)}]) assert.equal((await module.createBankTransfer(form(changes))).success,false);
 assert.equal(calls.length,0);
 assert.equal((await module.createBankTransfer(form({user_id:'forged'}))).success,true);
 assert.deepEqual(calls,[{name:'create_bank_transfer',args:{source_bank_id:1,destination_bank_id:2,transfer_date:'2026-10-14',transfer_amount:3000,transfer_memo:'移動'}}]);
});
test('transfer changes both balances without adding spending', async () => {
 const {summarizeTransactions} = await loadModule('app/src/lib/db/dashboard-calculations.ts',{});
 const result = summarizeTransactions([
  {date:'2026-10-14',payment_method_id:1,type_id:2,amount:3000,transfer_id:'paired'},
  {date:'2026-10-14',payment_method_id:2,type_id:1,amount:3000,transfer_id:'paired'},
  {date:'2026-10-14',payment_method_id:1,type_id:2,amount:500,transfer_id:null},
 ],[{id:1,name:'収入'},{id:2,name:'支出'}],[1,2].map(id=>({payment_method_id:id,opening_balance:10000,opening_balance_date:'2026-10-01'})),{start:'2026-10-01',end:'2026-10-31',today:'2026-10-14'});
 assert.equal(result.balances.get(1),6500); assert.equal(result.balances.get(2),13000);
 assert.equal(result.spending.get(1),500); assert.equal(result.spending.has(2),false);
});
test('transfer deletion uses paired RPC and refuses individual edits',async()=>{
 const calls=[];
 const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:{id:7,transfer_id:'pair'},error:null})};
 const module=await loadModule('app/bank-accounts/[id]/actions.ts',{
  'next/cache':{revalidatePath:()=>{}},
  '@/src/lib/db/user':{getUserDatabase:async()=>({user:{id:'verified'},supabase:{
   from:table=>table==='bank_accounts'?{select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{payment_method_id:5},error:null})})})})}:chain,
   rpc:async(name,args)=>{calls.push({name,args});return {error:null}}
  }})}
 });
 const data=new FormData();for(const [key,value] of Object.entries({bank_id:'1',id:'7',operation:'delete'}))data.set(key,value);
 assert.equal((await module.mutateBankTransaction(data)).success,true);
 assert.deepEqual(calls,[{name:'delete_bank_transfer',args:{transaction_id:7,bank_id:1}}]);
 for(const [key,value] of Object.entries({operation:'update',date:'2026-10-14',amount:'100',type_id:'1',memo:'',location:'',note:'',tag:''}))data.set(key,value);
 assert.equal((await module.mutateBankTransaction(data)).success,false);assert.equal(calls.length,1);
});
