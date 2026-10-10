import test from 'node:test';
import assert from 'node:assert/strict';
import {previewSalesCSV} from '../import-sales.mjs';
import {receivables} from '../finance.mjs';
const header='empresa,referencia,cliente,fecha_emision,fecha_vencimiento,base,impuesto,cobrado';
const row='DEMO-001,CSV-001,Cliente Demo,2026-09-01,2026-10-15,1000,180,590';
const options={companyCode:'DEMO-001',asOf:'2026-10-10'};
test('Exact amounts and finance integration after partial payment',()=>{
  const r=previewSalesCSV(`${header}\n${row}`,options);
  assert.equal(r.accepted[0].totalCents,118000);assert.equal(r.accepted[0].paidCents,59000);
  assert.equal(receivables(r.accepted,options.asOf).outstandingCents,59000);
});
test('Reimport does not duplicate; a changed record blocks the batch',()=>{
  const first=previewSalesCSV(`${header}\n${row}`,options);
  const repeated=previewSalesCSV(`${header}\n${row}`,{...options,existing:first.accepted});
  assert.equal(repeated.accepted.length,0);assert.equal(repeated.duplicates,1);
  const conflict=previewSalesCSV(`${header}\n${row.replace('1000,180','2000,180')}`,{...options,existing:first.accepted});
  assert.equal(conflict.blocked,true);assert.equal(conflict.rows[0].status,'CONFLICTO');
});
test('Duplicate references in same batch; conflicting rows block all',()=>{
  const same=previewSalesCSV(`${header}\n${row}\n${row.toLowerCase().replace('cliente demo','Cliente Demo')}`,options);
  assert.equal(same.accepted.length,1);assert.equal(same.duplicates,1);
  const conflict=previewSalesCSV(`${header}\n${row}\n${row.replace('590','0')}`,options);
  assert.equal(conflict.blocked,true);assert.equal(conflict.accepted.length,0);
  assert.ok(conflict.rows.every(r=>r.status==='CONFLICTO'));
});
test('BOM, CRLF, semicolon, quoted decimal comma and escaped quotes',()=>{
  const line='DEMO-001;CSV-001;"Cliente ""Demo""";2026-09-01;2026-10-15;"1000,50";"180,09";0';
  const r=previewSalesCSV(`\uFEFF${header.replaceAll(',',';')}\r\n${line}\r\n`,options);
  assert.equal(r.accepted[0].totalCents,118059);assert.equal(r.accepted[0].client,'Cliente "Demo"');
});
test('Wrong company, nonexistent date, excessive payment and malformed CSV rejected',()=>{
  for(const line of [row.replace('DEMO-001','DEMO-002'),row.replace('2026-09-01','2026-02-30'),row.replace('590','9999'),row.replace('1000','-1')]){
    const r=previewSalesCSV(`${header}\n${line}`,options);assert.equal(r.blocked,true);assert.equal(r.accepted.length,0);assert.equal(r.rows[0].line,2);
  }
  assert.throws(()=>previewSalesCSV(`${header}\n"unterminated`,options));
  assert.throws(()=>previewSalesCSV('wrong\nheaders',options));
});
test('File and row limits reject oversized batches before confirmation',()=>{
  assert.throws(()=>previewSalesCSV('x'.repeat(1048577),options));
  assert.throws(()=>previewSalesCSV(`${header}\n${Array(501).fill(row).join('\n')}`,options));
});
test('Later issue date and invalid payment precision block the complete batch',()=>{
  for(const line of [row.replace('2026-09-01','2026-10-11'),row.replace('590','590.001'),row.replace('1000','1,000')]){
    const r=previewSalesCSV(`${header}\n${row}\n${line}`,options);assert.equal(r.blocked,true);assert.equal(r.accepted.length,0);
  }
});
test('References are scoped to the selected company, not globally',()=>{
  const r=previewSalesCSV(`${header}\n${row.replace('DEMO-001','DEMO-002')}`,{...options,companyCode:'DEMO-002'});
  assert.equal(r.accepted.length,1);
});
