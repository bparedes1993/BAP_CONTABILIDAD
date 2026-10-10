// PostgreSQL WASM with a minimal auth stub, NOT a Supabase integration test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('PostgreSQL migrations, RLS and monetary transactions',async t=>{
  const db=new PGlite();
  async function user(uid,sql,params=[],aal='aal2'){
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,aal})]);await db.exec('set role authenticated');
    try{return await db.query(sql,params);}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}
  }
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
      grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;`);
    await db.exec(await readFile(new URL('../sql/001_pilot.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../sql/003_purchases_settlements.sql',import.meta.url),'utf8'));
    const admin=id(1),reader=id(2),aux=id(3),otherAdmin=id(4),studioA=id(10),studioB=id(11),companyA=id(20),companyA2=id(21),companyB=id(22),partyA=id(30),partyB=id(31);
    await db.query('insert into auth.users(id) values ($1),($2),($3),($4)',[admin,reader,aux,otherAdmin]);
    await db.query("insert into public.studios(id,name) values($1,'Estudio A'),($2,'Estudio B')",[studioA,studioB]);
    await db.query("insert into public.companies(id,studio_id,name,reference_code,sector) values($1,$2,'Empresa A','AA','servicios'),($3,$2,'Empresa A2','A2','comercio'),($4,$5,'Empresa B','BB','construccion')",[companyA,studioA,companyA2,companyB,studioB]);
    await db.query("insert into public.memberships(user_id,studio_id,company_id,role) values($1,$2,null,'admin'),($3,$2,$4,'lector'),($5,$2,$4,'auxiliar'),($6,$7,null,'admin')",[admin,studioA,reader,companyA,aux,otherAdmin,studioB]);
    const accountant=id(5);await db.query('insert into auth.users(id) values($1)',[accountant]);
    await db.query("insert into public.memberships(user_id,studio_id,company_id,role) values($1,$2,$3,'contador')",[accountant,studioA,companyA]);
    await db.query("insert into public.counterparties(id,company_id,reference_code,name) values($1,$2,'PA','Tercero A'),($3,$4,'PB','Tercero B')",[partyA,companyA,partyB,companyB]);
    const {rows:[{today}]}=await db.query("select ((now() at time zone 'America/Lima')::date)::text as today");
    const saleSQL="select public.create_sale_draft($1,$2,$3,$4,$5,$6::jsonb) as id";
    const lines=JSON.stringify([{description:'Servicio interno',quantity:1,unit_price:100,example_tax_rate:18}]);
    const saleA=(await user(admin,saleSQL,[companyA,partyA,id(40),'V-A',today,lines])).rows[0].id;
    const saleB=(await user(otherAdmin,saleSQL,[companyB,partyB,id(41),'V-B',today,lines])).rows[0].id;
    const purchaseSQL='select public.create_purchase_draft($1,$2,$3,$4,$5,$6,$7,$8) as id';
    const purchaseA=(await user(admin,purchaseSQL,[companyA,partyA,id(42),'C-A',today,today,100,18])).rows[0].id;
    const settleSQL='select public.apply_settlement($1,$2,$3,$4,$5,$6,$7) as id';
    const reverseSQL='select public.reverse_settlement($1,$2,$3,$4) as id';
    await t.test('Sales retries detect changed data and malformed lines roll back',async()=>{
      assert.equal((await user(admin,saleSQL,[companyA,partyA,id(40),' v-a ',today,lines])).rows[0].id,saleA);
      await assert.rejects(user(admin,saleSQL,[companyA,partyA,id(40),'V-A',today,lines.replace('100','101')]),/datos diferentes/);
      const before=(await user(admin,'select * from public.sales')).rows.length;
      await assert.rejects(user(admin,saleSQL,[companyA,partyA,id(45),'INVALIDO',today,JSON.stringify([{description:'Error de prueba',quantity:null,unit_price:1,example_tax_rate:0}])]));
      assert.equal((await user(admin,'select * from public.sales')).rows.length,before);
    });
    await t.test('Company/studio isolation and private movements',async()=>{
      assert.equal((await user(reader,'select * from public.companies')).rows.length,1);
      assert.equal((await user(admin,'select * from public.companies')).rows.length,2);
      assert.equal((await user(reader,'select * from public.sales where id=$1',[saleB])).rows.length,0);
      assert.equal((await user(otherAdmin,'select * from public.purchases where id=$1',[purchaseA])).rows.length,0);
      assert.equal((await user(reader,'select * from public.audit_events')).rows.length,0);
      await assert.rejects(user(admin,settleSQL,[companyA,'sale',saleB,id(49),10,today,'REF-B']),/Documento no pertenece/);
    });
    await t.test('Anonymous access, direct writes and role elevation denied',async()=>{
      await db.exec('set role anon');
      try{await assert.rejects(db.query('select * from public.settlements'),/permission denied/);}finally{await db.exec('reset role');}
      for(const table of ['sales','purchases','settlements'])await assert.rejects(user(admin,`delete from public.${table}`),/permission denied/);
      await assert.rejects(user(reader,"update public.memberships set role='admin'"),/permission denied/);
      await assert.rejects(user(admin,'update public.sales set settled_amount=100 where id=$1',[saleA]),/permission denied/);
      await assert.rejects(user(admin,"insert into public.settlements(company_id) values($1)",[companyA]),/permission denied/);
      for(const who of [reader,aux,otherAdmin])await assert.rejects(user(who,settleSQL,[companyA,'sale',saleA,id(50),59,today,'COBRO-01']),/Acceso denegado/);
    });
    await t.test('Partial payment and exact retry; conflicting retry rejected',async()=>{
      const args=[companyA,'sale',saleA,id(51),59,today,'COBRO-01'];
      await assert.rejects(user(admin,settleSQL,args,'aal1'),/Acceso denegado/);
      const payment=(await user(admin,settleSQL,args)).rows[0].id;
      assert.equal((await user(admin,settleSQL,args)).rows[0].id,payment);
      assert.equal((await user(admin,'select settled_amount from public.sales where id=$1',[saleA])).rows[0].settled_amount,'59.00');
      await assert.rejects(user(admin,settleSQL,[...args.slice(0,4),58,today,'COBRO-01']),/datos diferentes/);
      assert.equal((await user(reader,'select * from public.settlements')).rows.length,1);
      assert.equal((await user(otherAdmin,'select * from public.settlements')).rows.length,0);
    });
    await t.test('Overpayment and invalid decimals/date cannot alter balance',async()=>{
      for(const amount of [60,0,-1,'NaN',0.001])await assert.rejects(user(admin,settleSQL,[companyA,'sale',saleA,id(52),amount,today,'INVALIDO']));
      await assert.rejects(user(admin,settleSQL,[companyA,'sale',saleA,id(52),1,'2000-01-01','INVALIDO']));
      assert.equal((await user(admin,'select settled_amount from public.sales where id=$1',[saleA])).rows[0].settled_amount,'59.00');
    });
    await t.test('Reversal is traceable, requires reason and cannot repeat',async()=>{
      const payment=(await user(admin,'select id from public.settlements where request_id=$1',[id(51)])).rows[0].id;
      await assert.rejects(user(reader,reverseSQL,[companyA,payment,id(60),'Corrección de prueba']),/Acceso denegado/);
      await assert.rejects(user(admin,reverseSQL,[companyA,payment,id(60),'']),/Motivo/);
      const args=[companyA,payment,id(60),'Corrección de prueba'];
      await user(admin,reverseSQL,args);await user(admin,reverseSQL,args);
      await assert.rejects(user(admin,reverseSQL,[companyA,payment,id(61),'Segundo reverso']),/ya revertido/);
      assert.equal((await user(admin,'select settled_amount from public.sales where id=$1',[saleA])).rows[0].settled_amount,'0.00');
      assert.ok((await user(admin,"select * from public.audit_events where entity='settlements' and action='UPDATE'")).rows.length>0);
    });
    await t.test('Purchase foreign party, conflicting retry and payment balance',async()=>{
      await assert.rejects(user(admin,purchaseSQL,[companyA,partyB,id(70),'C-B',today,today,100,18]),/Tercero no pertenece/);
      assert.equal((await user(admin,purchaseSQL,[companyA,partyA,id(42),'C-A',today,today,100,18])).rows[0].id,purchaseA);
      await assert.rejects(user(admin,purchaseSQL,[companyA,partyA,id(42),'C-A',today,today,200,18]),/datos diferentes/);
      await user(admin,settleSQL,[companyA,'purchase',purchaseA,id(71),118,today,'PAGO-01']);
      await assert.rejects(user(admin,settleSQL,[companyA,'purchase',purchaseA,id(72),0.01,today,'PAGO-02']),/saldo inválido/);
      assert.equal((await user(admin,'select settled_amount from public.purchases where id=$1',[purchaseA])).rows[0].settled_amount,'118.00');
    });
    await t.test('Accountant needs MFA and cannot operate on another company',async()=>{
      const args=[companyA,'sale',saleA,id(73),1,today,'CONTADOR-01'];
      await assert.rejects(user(accountant,settleSQL,args,'aal1'),/Acceso denegado/);
      await assert.rejects(user(accountant,settleSQL,[companyA2,'sale',saleA,id(74),1,today,'CONTADOR-02']),/Acceso denegado/);
      const movement=(await user(accountant,settleSQL,args)).rows[0].id;
      await user(accountant,reverseSQL,[companyA,movement,id(75),'Corrección de prueba']);
      assert.equal((await user(accountant,'select settled_amount from public.sales where id=$1',[saleA])).rows[0].settled_amount,'0.00');
    });
    await t.test('Inactive membership immediately denies money RPC',async()=>{
      await db.query('update public.memberships set active=false where user_id=$1',[admin]);
      await assert.rejects(user(admin,settleSQL,[companyA,'sale',saleA,id(80),1,today,'INACTIVO']),/Acceso denegado/);
      assert.equal((await user(admin,'select * from public.sales')).rows.length,0);
    });
  }finally{await db.close();}
});
