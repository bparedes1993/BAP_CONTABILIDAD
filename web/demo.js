// Public demonstration. All records are fictitious and kept only in memory.
import { receivables, cashScenario } from './finance.mjs';
import { previewSalesCSV, MAX_CSV_BYTES } from './import-sales.mjs';
const companies = [
  {code:'DEMO-001',name:'Andes Consultores Demo',sector:'SERVICIOS',party:'Cliente Ejemplo Norte',reference:'INT-S-001',description:'Asesoría mensual',base:1000,tax:180},
  {code:'DEMO-002',name:'Mercado Central Demo',sector:'COMERCIO',party:'Comprador Ejemplo Sur',reference:'INT-C-001',description:'Venta de artículos',base:750,tax:135},
  {code:'DEMO-003',name:'Obras del Pacífico Demo',sector:'CONSTRUCCIÓN',party:'Contratante Ejemplo',reference:'INT-O-001',description:'Servicio de obra',base:2400,tax:432},
  {code:'DEMO-004',name:'Servicios Lima Demo',sector:'SERVICIOS',party:'Cliente Referencial',reference:'INT-S-002',description:'Mantenimiento',base:400,tax:72},
  {code:'DEMO-005',name:'Comercial Horizonte Demo',sector:'COMERCIO',party:'Comprador Referencial',reference:'INT-C-002',description:'Suministros',base:1200,tax:216}
];
let selected=0;
const records=new Map();
let batch=null,readVersion=0;
const $=id=>document.getElementById(id);
const money=n=>`S/ ${n.toLocaleString('es-PE',{minimumFractionDigits:2})}`;
const addRow=(target,values)=>{const row=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=value;row.append(td);}target.append(row);};
const AS_OF='2026-10-10';
function sampleInvoices(c){
  if(records.has(c.code))return records.get(c.code);
  const amount=Math.round((c.base+c.tax)*100);
  const initial=[
    {reference:`${c.reference}-A`,issuedOn:'2026-08-01',dueOn:'2026-09-01',totalCents:amount,paidCents:Math.round(amount/2)},
    {reference:`${c.reference}-B`,issuedOn:'2026-09-25',dueOn:'2026-10-15',totalCents:amount*2,paidCents:0},
    {reference:`${c.reference}-C`,issuedOn:'2026-09-25',dueOn:'2026-10-05',totalCents:amount,paidCents:amount}
  ].map((row,i)=>({...row,client:c.party,baseCents:Math.round(c.base*100)*(i===1?2:1),taxCents:Math.round(c.tax*100)*(i===1?2:1)}));
  records.set(c.code,initial);return initial;
}
function clearBatch(){batch=null;readVersion++;$('import-confirm').disabled=true;$('import-file').value='';$('import-preview').replaceChildren();$('import-summary').textContent='Selecciona un CSV ficticio o carga el ejemplo.';}
function preview(text){
  batch=null;$('import-confirm').disabled=true;$('import-preview').replaceChildren();
  try{
    const c=companies[selected];
    const result=previewSalesCSV(text,{companyCode:c.code,existing:sampleInvoices(c),asOf:AS_OF});
    result.rows.forEach(row=>addRow($('import-preview'),[String(row.line),row.record?.reference||'—',row.record?.client||'—',row.record?money(row.record.totalCents/100):'—',row.status,row.message]));
    $('import-summary').textContent=result.blocked?'Corrige los errores y conflictos; no se aplicará ninguna fila del lote.':`${result.accepted.length} registros nuevos · ${result.duplicates} duplicados que se omitirán.`;
    if(!result.blocked&&result.accepted.length){batch={text,company:c.code};$('import-confirm').disabled=false;}
  }catch(error){$('import-summary').textContent=error.message;}
}
async function readImport(loader){
  const version=++readVersion,c=companies[selected].code;
  batch=null;$('import-confirm').disabled=true;$('import-preview').replaceChildren();$('import-summary').textContent='Leyendo el archivo…';
  try{const text=await loader();if(version===readVersion&&c===companies[selected].code)preview(text);}
  catch(error){if(version===readVersion)$('import-summary').textContent=error.message;}
}
function drawFinance(){
  const c=companies[selected],invoices=sampleInvoices(c);
  const opening=Number($('scenario-opening').value);
  if(!Number.isFinite(opening)||opening<0||opening>99999999){$('finance-feedback').textContent='Ingresa una caja inicial entre S/ 0 y S/ 99 999 999.';return;}
  $('finance-feedback').textContent='';
  const portfolio=receivables(invoices,AS_OF);
  const amount=Math.round((c.base+c.tax)*100);
  const bills=[{dueOn:'2026-10-12',amountCents:amount*2},{dueOn:'2026-10-25',amountCents:Math.round(amount/3)}];
  const scenario=cashScenario({invoices,bills,asOf:AS_OF,openingCents:Math.round(opening*100),horizonDays:Number($('scenario-horizon').value)});
  for(const [id,value] of [['finance-outstanding',portfolio.outstandingCents],['finance-overdue',portfolio.overdueCents],['finance-closing',scenario.closingCents],['finance-minimum',scenario.minimumCents]])$(id).textContent=money(value/100);
  const aging=$('aging-list');aging.replaceChildren();
  for(const [label,key] of [['Por vencer / vence hoy','current'],['1 a 30 días','days1to30'],['31 a 60 días','days31to60'],['Más de 60 días','days61plus']])addRow(aging,[label,money(portfolio.aging[key]/100)]);
  const balances=$('balances-list');balances.replaceChildren();
  portfolio.rows.forEach(row=>addRow(balances,[row.reference,row.dueOn,money(row.totalCents/100),money(row.paidCents/100),money(row.balanceCents/100),row.balanceCents===0?'Saldado':row.daysLate?`${row.daysLate} días vencido`:'Por vencer']));
  const flow=$('cash-list');flow.replaceChildren();
  scenario.daily.filter((row,i)=>i===0||row.inflowCents||row.outflowCents||i===scenario.daily.length-1).forEach(row=>addRow(flow,[row.date,money(row.inflowCents/100),money(row.outflowCents/100),money(row.balanceCents/100)]));
  const tasks=$('finance-actions');tasks.replaceChildren();
  const messages=[];
  if(scenario.firstShortfallOn)messages.push(`Caja insuficiente desde ${scenario.firstShortfallOn}: faltante máximo de ${money(-scenario.minimumCents/100)}. Revisa fechas de cobro y compromisos.`);
  if(portfolio.overdueCents)messages.push(`Prioriza la cobranza de ${money(portfolio.overdueCents/100)} vencidos. Estos importes no se cuentan como cobros futuros.`);
  messages.push(`Cobros programados: ${money(scenario.inflowCents/100)}. Pagos previstos: ${money(scenario.outflowCents/100)}. Confirma ambos antes de decidir.`);
  messages.forEach(message=>{const li=document.createElement('li');li.textContent=message;tasks.append(li);});
}
function draw(){
  const c=companies[selected];
  $('company-select').value=String(selected);
  $('company-name').textContent=c.name;
  const invoices=sampleInvoices(c);
  const parties=[...new Set(invoices.map(row=>row.client))];
  $('metric-count').textContent=String(invoices.length);$('metric-total').textContent=money(invoices.reduce((sum,row)=>sum+row.totalCents,0)/100);$('metric-parties').textContent=String(parties.length);
  $('recent-sales').replaceChildren();$('sales-list').replaceChildren();
  invoices.forEach(invoice=>{
    const total=invoice.totalCents/100;
    const sale=[invoice.issuedOn,invoice.reference,invoice.client,'BORRADOR INTERNO',money(total)];
    addRow($('recent-sales'),sale);addRow($('sales-list'),[...sale.slice(0,4),money(invoice.baseCents/100),sale[4]]);
  });
  $('parties-list').replaceChildren();parties.forEach((party,i)=>addRow($('parties-list'),[`CLIENTE-${i+1}`,party,AS_OF]));
  const list=$('companies-list');list.replaceChildren();
  companies.forEach((item,i)=>{
    const button=document.createElement('button');button.type='button';button.className=`company-card ${i===selected?'selected':''}`;
    for(const [tag,value] of [['small',item.sector],['strong',item.name],['span',item.code]]){
      const part=document.createElement(tag);part.textContent=value;button.append(part);
    }
    button.addEventListener('click',()=>{selected=i;clearBatch();draw();});list.append(button);
  });
  drawFinance();
}
function show(page){
  const titles={dashboard:'Resumen del estudio',companies:'Empresas',parties:'Terceros',sales:'Ventas internas',finance:'Cobranzas y caja',imports:'Importar ventas'};
  $('page-title').textContent=titles[page];$('breadcrumb').textContent=titles[page].toUpperCase();
  document.querySelectorAll('.page').forEach(el=>el.classList.toggle('hidden',el.id!==`${page}-page`));
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
}
const picker=$('company-select');
companies.forEach((c,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${c.code} · ${c.name}`;picker.append(option);});
picker.addEventListener('change',()=>{selected=Number(picker.value);clearBatch();draw();});
document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>show(button.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.goto)));
$('scenario-opening').addEventListener('input',drawFinance);
$('scenario-horizon').addEventListener('change',drawFinance);
$('import-file').addEventListener('change',event=>{
  const file=event.target.files[0];if(!file){clearBatch();return;}
  readImport(()=>{if(file.size>MAX_CSV_BYTES)throw new Error('El CSV supera 1 MB');return file.text();});
});
$('import-example').addEventListener('click',()=>{
  const company=companies[selected].code;
  readImport(async()=>{const response=await fetch('./examples/ventas-demo.csv');if(!response.ok)throw new Error('No se pudo cargar el ejemplo');return (await response.text()).replaceAll('DEMO-001',company);});
});
$('import-confirm').addEventListener('click',()=>{
  if(!batch||batch.company!==companies[selected].code)return;
  const c=companies[selected],result=previewSalesCSV(batch.text,{companyCode:c.code,existing:sampleInvoices(c),asOf:AS_OF});
  if(result.blocked){preview(batch.text);return;}
  const count=result.accepted.length;records.set(c.code,[...sampleInvoices(c),...result.accepted]);clearBatch();draw();
  $('import-summary').textContent=`${count} registros de prueba aplicados. Resumen y cobranzas actualizados; se perderán al recargar.`;
});
$('import-reset').addEventListener('click',()=>{records.delete(companies[selected].code);clearBatch();draw();$('import-summary').textContent='La empresa seleccionada volvió a sus registros iniciales.';});
draw();show('dashboard');

