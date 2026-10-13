import assert from 'node:assert/strict';
import test from 'node:test';
import {loadModule} from './module-loader.mjs';

test('account order validates IDs and sends the requested order to atomic user RPC',async()=>{
 const calls=[];
 const module=await loadModule('app/components/account-order-actions.ts',{
  'next/cache':{revalidatePath:()=>{}},
  '@/src/lib/db/user':{getUserDatabase:async()=>({supabase:{rpc:async(name,args)=>{calls.push({name,args});return {error:null}}}})}
 });
 for(const [kind,ids] of [['bank',[]],['card',[1,1]],['bank',[-1]],['other',[1]],['bank',[1.5]]]) assert.equal((await module.saveAccountOrder(kind,ids)).success,false);
 assert.equal(calls.length,0);
 for(const kind of ['bank','card']) assert.equal((await module.saveAccountOrder(kind,[3,1,2])).success,true);
 assert.deepEqual(calls.map(call=>call.args),[{account_kind:'bank',account_ids:[3,1,2]},{account_kind:'card',account_ids:[3,1,2]}]);
});
test('failed ordering reports error and does not invalidate pages',async()=>{
 const module=await loadModule('app/components/account-order-actions.ts',{
  'next/cache':{revalidatePath:()=>assert.fail()},
  '@/src/lib/db/user':{getUserDatabase:async()=>({supabase:{rpc:async()=>({error:{code:'42501'}})}})}
 });
 assert.equal((await module.saveAccountOrder('bank',[1,2])).success,false);
});
