// No network/storage access. Prepares a batch for explicit review and confirmation.
const HEADERS=['empresa','referencia','cliente','fecha_emision','fecha_vencimiento','base','impuesto','cobrado'];
export const MAX_CSV_BYTES=1048576;
const key=value=>String(value).trim().normalize('NFKC').toUpperCase();
function amount(value){
  const text=value.trim();
  if(!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(text))throw new Error('Importe inválido: usa hasta dos decimales y sin separador de miles');
  const [whole,fraction='']=text.replace(',','.').split('.');
  const result=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(result))throw new Error('Importe fuera de rango');
  return result;
}
function date(value){
  const result=value.trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(result))throw new Error('Fecha inválida: usa AAAA-MM-DD');
  const time=Date.parse(`${result}T00:00:00Z`);
  if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==result)throw new Error('Fecha inexistente');
  return result;
}
function parseCSV(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_CSV_BYTES)throw new Error('El CSV supera 1 MB');
  text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  const delimiter=text.split('\n')[0].includes(';')?';':',';
  const rows=[];let fields=[],field='',quoted=false,closed=false,line=1,start=1;
  function finishField(){fields.push(field);field='';closed=false;}
  function finishRow(){finishField();if(fields.some(value=>value.trim()))rows.push({line:start,fields});fields=[];start=line+1;}
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){
      if(char==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}
      else{field+=char;if(char==='\n')line++;}
    }else if(char===delimiter)finishField();
    else if(char==='\n'){finishRow();line++;}
    else if(char==='"'){if(field||closed)throw new Error(`Comillas inválidas en línea ${line}`);quoted=true;}
    else{if(closed)throw new Error(`Texto después de comillas en línea ${line}`);field+=char;}
  }
  if(quoted)throw new Error('Comillas sin cerrar');
  if(field||fields.length||closed)finishRow();
  if(rows.length>501)throw new Error('Máximo 500 registros por lote');
  return rows;
}
const fingerprint=row=>JSON.stringify([row.client,row.issuedOn,row.dueOn,row.baseCents,row.taxCents,row.paidCents]);
export function previewSalesCSV(text,{companyCode,existing=[],asOf}){
  date(asOf);
  const parsed=parseCSV(text);if(!parsed.length)throw new Error('Archivo vacío');
  const header=parsed.shift().fields.map(value=>value.trim().toLowerCase());
  if(header.length!==HEADERS.length||HEADERS.some((name,i)=>name!==header[i]))throw new Error(`Encabezados esperados: ${HEADERS.join(',')}`);
  const known=new Map(existing.map(row=>[key(row.reference),row]));
  const within=new Map(),rows=[];
  for(const entry of parsed){
    const row={line:entry.line,status:'VÁLIDO',message:'Listo para importar',record:null};
    try{
      if(entry.fields.length!==HEADERS.length)throw new Error('Cantidad de columnas incorrecta');
      const [company,reference,client,issued,due,base,tax,paid]=entry.fields;
      if(key(company)!==key(companyCode))throw new Error('La empresa del CSV no coincide con la seleccionada');
      const ref=key(reference),name=client.trim();
      if(ref.length<2||ref.length>50||name.length<2||name.length>160||/[\u0000-\u001f\u007f]/.test(ref+name))throw new Error('Referencia o cliente inválido');
      const issuedOn=date(issued),dueOn=date(due);
      if(issuedOn>asOf)throw new Error('Emisión posterior a la fecha de corte');
      if(dueOn<issuedOn)throw new Error('Vencimiento anterior a emisión');
      const baseCents=amount(base),taxCents=amount(tax),paidCents=amount(paid),totalCents=baseCents+taxCents;
      if(baseCents<=0||paidCents>totalCents)throw new Error('Base debe ser positiva y cobrado no puede superar el total');
      row.record={reference:ref,client:name,issuedOn,dueOn,baseCents,taxCents,paidCents,totalCents};
      if(known.has(ref)){
        const same=fingerprint(known.get(ref))===fingerprint(row.record);
        row.status=same?'DUPLICADO':'CONFLICTO';row.message=same?'Ya existe; se omitirá':'Ya existe con datos distintos; no se sobrescribirá';
      }
      if(within.has(ref)){
        const first=within.get(ref);
        if(fingerprint(first.record)!==fingerprint(row.record)){
          first.status='CONFLICTO';first.message='Referencia repetida con datos distintos en el lote';
          row.status='CONFLICTO';row.message=first.message;
        }else if(row.status==='VÁLIDO'){row.status='DUPLICADO';row.message='Repetido en el lote; se omitirá';}
      }else within.set(ref,row);
    }catch(error){row.status='ERROR';row.message=error.message;}
    rows.push(row);
  }
  const blocked=rows.some(row=>['ERROR','CONFLICTO'].includes(row.status));
  const accepted=blocked?[]:rows.filter(row=>row.status==='VÁLIDO').map(row=>row.record);
  let total=0;
  for(const record of [...existing,...accepted]){
    total+=record.totalCents;
    if(!Number.isSafeInteger(total))throw new Error('El total acumulado supera el límite de cálculo');
  }
  return {rows,accepted,blocked,duplicates:rows.filter(row=>row.status==='DUPLICADO').length};
}
