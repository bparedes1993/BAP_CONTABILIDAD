import test from 'node:test';
import assert from 'node:assert/strict';
import {transact,cashDelta,moneyInput,purchaseDraft} from '../settlements.mjs';
const context={role:'contador',asOf:'2026-10-10'};
const docs=[{companyId:'A',kind:'sale',reference:'V-1',issuedOn:'2026-09-01',totalCents:118000,paidCents:59000},{companyId:'A',kind:'purchase',reference:'C-1',issuedOn:'2026-09-01',totalCents:50000,paidCents:0}];
const pay={type:'payment',companyId:'A',kind:'sale',reference:'V-1',amountCents:20000,paidOn:'2026-10-10',requestId:'req-1',externalReference:'OPERACION-01'};
test('Partial payment, exact replay and changed replay',()=>{
  const r=transact(docs,[],pay,context);assert.equal(r.documents[0].paidCents,79000);assert.equal(docs[0].paidCents,59000);
  const repeated=transact(r.documents,r.events,pay,context);assert.equal(repeated.events.length,1);assert.equal(repeated.replayed,true);
  assert.throws(()=>transact(r.documents,r.events,{...pay,amountCents:1},context));
});
test('Overpayment, wrong company, reader/auxiliary and date violations denied',()=>{
  for(const command of [{...pay,amountCents:60000},{...pay,companyId:'B'},{...pay,paidOn:'2026-08-01'},{...pay,paidOn:'2026-10-11'},{...pay,amountCents:1.2}])assert.throws(()=>transact(docs,[],command,context));
  for(const role of ['lector','auxiliar'])assert.throws(()=>transact(docs,[],pay,{...context,role}));
});
test('Reversal restores baseline; replay does not reverse twice; reason required',()=>{
  const r=transact(docs,[],pay,context);
  const undo={type:'reversal',companyId:'A',requestId:'undo-1',originalRequestId:'req-1',reason:'Pago aplicado por error'};
  const u=transact(r.documents,r.events,undo,context);assert.equal(u.documents[0].paidCents,59000);assert.equal(cashDelta(u.events,'A'),0);
  assert.equal(transact(u.documents,u.events,undo,context).events.length,2);
  assert.throws(()=>transact(u.documents,u.events,{...undo,requestId:'undo-2'},context));
  assert.throws(()=>transact(r.documents,r.events,{...undo,reason:''},context));
});
test('Purchase payments reduce cash and support zero final balance',()=>{
  const r=transact(docs,[],{...pay,kind:'purchase',reference:'C-1',amountCents:50000},context);
  assert.equal(r.documents[1].totalCents-r.documents[1].paidCents,0);assert.equal(cashDelta(r.events,'A'),-50000);assert.equal(cashDelta(r.events,'B'),0);
  assert.equal(moneyInput('590,05'),59005);assert.throws(()=>moneyInput('-1'));assert.throws(()=>moneyInput('1.001'));
});
test('Purchase preparation validates amount, dates and duplicates',()=>{
  const input={reference:'C-2',supplier:'Proveedor Demo',issuedOn:'2026-09-01',dueOn:'2026-10-15',base:'100',tax:'18'};
  const context={companyId:'A',asOf:'2026-10-10'};
  const doc=purchaseDraft(input,context);assert.equal(doc.totalCents,11800);assert.equal(doc.kind,'purchase');
  assert.throws(()=>purchaseDraft(input,{...context,existing:[doc]}));
  assert.throws(()=>purchaseDraft({...input,dueOn:'2026-08-01'},context));
});
