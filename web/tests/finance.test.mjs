import test from 'node:test';
import assert from 'node:assert/strict';
import { receivables, cashScenario } from '../finance.mjs';
const invoice=(dueOn,totalCents=10000,paidCents=0)=>({issuedOn:'2026-07-01',dueOn,totalCents,paidCents});
test('Aging boundaries, partial payments and settled invoices',()=>{
  const r=receivables([invoice('2026-10-10'),invoice('2026-10-09',10000,5000),invoice('2026-09-10'),invoice('2026-09-09'),invoice('2026-08-11'),invoice('2026-08-10'),invoice('2026-08-01',10000,10000)],'2026-10-10');
  assert.deepEqual(r.aging,{current:10000,days1to30:15000,days31to60:20000,days61plus:10000});
  assert.equal(r.outstandingCents,55000);assert.equal(r.overdueCents,45000);assert.equal(r.collectedCents,15000);
});
test('A positive closing balance does not conceal an earlier cash deficit',()=>{
  const r=cashScenario({invoices:[invoice('2026-10-20',20000)],bills:[{dueOn:'2026-10-12',amountCents:15000}],asOf:'2026-10-10',openingCents:10000});
  assert.equal(r.closingCents,15000);assert.equal(r.minimumCents,-5000);assert.equal(r.firstShortfallOn,'2026-10-12');
});
test('Overdue receipts excluded; overdue payments immediate; horizon inclusive',()=>{
  const r=cashScenario({invoices:[invoice('2026-10-09'),invoice('2026-11-09',20000),invoice('2026-11-10',30000)],bills:[{dueOn:'2026-10-01',amountCents:5000}],asOf:'2026-10-10',openingCents:0});
  assert.equal(r.excludedOverdueCents,10000);assert.equal(r.inflowCents,20000);assert.equal(r.closingCents,15000);assert.equal(r.firstShortfallOn,'2026-10-10');
});
test('Invalid dates, excess payments and noninteger currency are rejected',()=>{
  assert.throws(()=>receivables([invoice('2026-02-30')],'2026-10-10'));
  assert.throws(()=>receivables([invoice('2026-10-11',1,2)],'2026-10-10'));
  assert.throws(()=>receivables([invoice('2026-10-11',1.5)],'2026-10-10'));
  assert.throws(()=>cashScenario({invoices:[],bills:[],asOf:'2026-10-10',openingCents:0,horizonDays:0}));
});
test('Negative opening after session payments is reported before later receipts',()=>{
  const r=cashScenario({invoices:[invoice('2026-10-15',20000)],bills:[],asOf:'2026-10-10',openingCents:-5000});
  assert.equal(r.firstShortfallOn,'2026-10-10');assert.equal(r.minimumCents,-5000);assert.equal(r.closingCents,15000);
});
