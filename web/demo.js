// Public, read-only demonstration. All records are invented and kept in memory.
const companies = [
  {code:'DEMO-001',name:'Andes Consultores Demo',sector:'SERVICIOS',party:'Cliente Ejemplo Norte',reference:'INT-S-001',description:'Asesoría mensual',base:1000,tax:180},
  {code:'DEMO-002',name:'Mercado Central Demo',sector:'COMERCIO',party:'Comprador Ejemplo Sur',reference:'INT-C-001',description:'Venta de artículos',base:750,tax:135},
  {code:'DEMO-003',name:'Obras del Pacífico Demo',sector:'CONSTRUCCIÓN',party:'Contratante Ejemplo',reference:'INT-O-001',description:'Servicio de obra',base:2400,tax:432},
  {code:'DEMO-004',name:'Servicios Lima Demo',sector:'SERVICIOS',party:'Cliente Referencial',reference:'INT-S-002',description:'Mantenimiento',base:400,tax:72},
  {code:'DEMO-005',name:'Comercial Horizonte Demo',sector:'COMERCIO',party:'Comprador Referencial',reference:'INT-C-002',description:'Suministros',base:1200,tax:216}
];
let selected=0;
const $=id=>document.getElementById(id);
const money=n=>`S/ ${n.toLocaleString('es-PE',{minimumFractionDigits:2})}`;
const addRow=(target,values)=>{const row=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=value;row.append(td);}target.append(row);};
function draw(){
  const c=companies[selected];
  $('company-select').value=String(selected);
  $('company-name').textContent=c.name;
  $('metric-count').textContent='1';$('metric-total').textContent=money(c.base+c.tax);$('metric-parties').textContent='1';
  const sale=['25/09/2026',c.reference,c.party,'BORRADOR INTERNO',money(c.base+c.tax)];
  $('recent-sales').replaceChildren();addRow($('recent-sales'),sale);
  $('sales-list').replaceChildren();addRow($('sales-list'),[...sale.slice(0,4),money(c.base),sale[4]]);
  $('parties-list').replaceChildren();addRow($('parties-list'),['CLIENTE-DEMO',c.party,'25/09/2026']);
  const list=$('companies-list');list.replaceChildren();
  companies.forEach((item,i)=>{
    const button=document.createElement('button');button.type='button';button.className=`company-card ${i===selected?'selected':''}`;
    for(const [tag,value] of [['small',item.sector],['strong',item.name],['span',item.code]]){
      const part=document.createElement(tag);part.textContent=value;button.append(part);
    }
    button.addEventListener('click',()=>{selected=i;draw();});list.append(button);
  });
}
function show(page){
  const titles={dashboard:'Resumen del estudio',companies:'Empresas',parties:'Terceros',sales:'Ventas internas'};
  $('page-title').textContent=titles[page];$('breadcrumb').textContent=titles[page].toUpperCase();
  document.querySelectorAll('.page').forEach(el=>el.classList.toggle('hidden',el.id!==`${page}-page`));
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
}
const picker=$('company-select');
companies.forEach((c,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${c.code} · ${c.name}`;picker.append(option);});
picker.addEventListener('change',()=>{selected=Number(picker.value);draw();});
document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>show(button.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.goto)));
draw();show('dashboard');
