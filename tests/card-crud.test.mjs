import assert from 'node:assert/strict';
import test from 'node:test';
import {loadModule} from './module-loader.mjs';

for(const operation of ['create','update','delete'])test(`card transaction ${operation} scopes writes to verified user and bank`,async()=>{
 const filters=[];let written;
 const chain={eq:(key,value)=>{filters.push([key,value]);return chain},select:()=>chain,maybeSingle:async()=>({data:{id:7},error:null}),single:async()=>({data:{id:7},error:null})};
 const module=await loadModule('app/cards/[id]/actions.ts',{
  'next/cache':{revalidatePath:()=>{}},
  '@/src/lib/db/user':{getUserDatabase:async()=>({user:{id:'verified'},supabase:{from:table=>{
   if(table==='credit_cards')return {select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{payment_method_id:5},error:null})})})})};
   if(table==='transaction_types')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:2,name:'支出'},error:null})})})};
   assert.equal(table,'transactions');return {select:()=>({eq:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{id:7,transfer_id:null},error:null})})})})}),insert:values=>{written=values;return chain},update:values=>{written=values;return chain},delete:()=>chain};
  }}})}
 });
 const form=new FormData();for(const [key,value] of Object.entries({card_id:'1',id:'7',operation,date:'2026-10-11',amount:'100',type_id:'2',memo:'メモ',location:'',note:'',tag:'',user_id:'forged',payment_method_id:'999'}))form.set(key,value);
 assert.equal((await module.mutateCardTransaction(form)).success,true);
 if(operation==='create'){assert.equal(written.user_id,'verified');assert.equal(written.payment_method_id,5)}
 else {assert.deepEqual(filters,[['id',7],['user_id','verified'],['payment_method_id',5]]);if(written)assert.equal(written.user_id,undefined)}
});

test('card mutation rejects transactions on another card before writing',async()=>{
 const module=await loadModule('app/cards/[id]/actions.ts',{
  'next/cache':{revalidatePath:()=>assert.fail()},
  '@/src/lib/db/user':{getUserDatabase:async()=>({user:{id:'verified'},supabase:{from:table=>{
   const chain={eq:()=>chain,maybeSingle:async()=>({data:table==='credit_cards'?{payment_method_id:5}:null,error:null})};
   return {select:()=>chain,delete:()=>assert.fail('Foreign transaction must not be deleted')};
  }}})}
 });
 const form=new FormData();form.set('card_id','1');form.set('operation','delete');form.set('id','7');
 assert.equal((await module.mutateCardTransaction(form)).success,false);
});
