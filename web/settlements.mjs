// Pure transaction model for fictitious demo data. Server authorization is separate.
import {previewSalesCSV} from './import-sales.mjs';
export function purchaseDraft(input,{companyId,existing=[],asOf}){
  const quoted=value=>'"'+String(value).replaceAll('"','""')+'"';
  const header='empresa,referencia,cliente,fecha_emision,fecha_vencimiento,base,impuesto,cobrado';
  const text=header+'\n'+[companyId,input.reference,input.supplier,input.issuedOn,input.dueOn,input.base,input.tax,0].map(quoted).join(',');
  const result=previewSalesCSV(text,{companyCode:companyId,existing,asOf});
  if(result.blocked)throw new Error(result.rows.map(row=>row.message).join('; '));
  if(!result.accepted.length)throw new Error('La compra ya existe');
  return {...result.accepted[0],companyId,kind:'purchase'};
}
export function moneyInput(value){
  const text=String(value).trim();
  if(!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(text))throw new Error('Usa un importe positivo con hasta dos decimales, sin miles');
  const [whole,decimal='']=text.replace(',','.').split('.');
  const amount=Number(whole)*100+Number(decimal.padEnd(2,'0'));
  if(!Number.isSafeInteger(amount)||amount<=0)throw new Error('Importe inválido');
  return amount;
}
function validDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Fecha inválida');
  const t=Date.parse(`${value}T00:00:00Z`);
  if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==value)throw new Error('Fecha inválida');
}
function signature(command){return JSON.stringify([command.type,command.companyId,command.kind,command.reference,command.amountCents,command.paidOn,command.externalReference,command.reason,command.originalRequestId]);}
export function transact(documents,events,command,{role,asOf}){
  if(!['admin','contador'].includes(role))throw new Error('Rol sin permiso para mover dinero');
  validDate(asOf);
  if(typeof command.requestId!=='string'||!command.requestId.trim()||!command.companyId)throw new Error('Solicitud incompleta');
  if(!['payment','reversal'].includes(command.type))throw new Error('Movimiento inválido');
  const previous=events.find(e=>e.companyId===command.companyId&&e.requestId===command.requestId);
  const fingerprint=signature(command);
  if(previous){if(previous.fingerprint!==fingerprint)throw new Error('Solicitud repetida con datos diferentes');return {documents,events,event:previous,replayed:true};}
  let target,amount,original;
  if(command.type==='payment'){
    if(typeof command.externalReference!=='string'||command.externalReference.trim().length<2||command.externalReference.trim().length>80)throw new Error('Indica una referencia de operación de 2 a 80 caracteres');
    validDate(command.paidOn);
    if(command.paidOn>asOf)throw new Error('No se registran movimientos futuros');
    amount=command.amountCents;
    if(!Number.isSafeInteger(amount)||amount<=0)throw new Error('Importe inválido');
    target=documents.find(d=>d.companyId===command.companyId&&d.kind===command.kind&&d.reference===command.reference);
    if(!target)throw new Error('Documento no pertenece a la empresa');
    if(command.paidOn<target.issuedOn)throw new Error('Movimiento anterior al documento');
    if(amount>target.totalCents-target.paidCents)throw new Error('El importe supera el saldo pendiente');
  }else{
    if(typeof command.reason!=='string'||command.reason.trim().length<5||command.reason.trim().length>300)throw new Error('El reverso requiere un motivo de 5 a 300 caracteres');
    original=events.find(e=>e.companyId===command.companyId&&e.requestId===command.originalRequestId&&e.type==='payment');
    if(!original)throw new Error('Movimiento no pertenece a la empresa');
    if(events.some(e=>e.type==='reversal'&&e.companyId===command.companyId&&e.originalRequestId===original.requestId))throw new Error('Movimiento ya revertido');
    target=documents.find(d=>d.companyId===command.companyId&&d.kind===original.kind&&d.reference===original.reference);
    if(!target)throw new Error('Documento inexistente');
    amount=-original.amountCents;
  }
  const nextPaid=target.paidCents+amount;
  if(!Number.isSafeInteger(nextPaid)||nextPaid<0||nextPaid>target.totalCents)throw new Error('Saldo inconsistente');
  const event={...command,kind:target.kind,reference:target.reference,amountCents:amount,paidOn:command.type==='payment'?command.paidOn:asOf,fingerprint};
  return {documents:documents.map(d=>d===target?{...d,paidCents:nextPaid}:d),events:[...events,event],event,replayed:false};
}
export function cashDelta(events,companyId){
  const result=events.filter(e=>e.companyId===companyId).reduce((sum,e)=>sum+(e.kind==='sale'?e.amountCents:-e.amountCents),0);
  if(!Number.isSafeInteger(result))throw new Error('Importe fuera de rango');
  return result;
}
