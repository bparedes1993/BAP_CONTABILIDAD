import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.1';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const $ = (id) => document.getElementById(id);
const state = {client:null,user:null,memberships:[],companies:[],company:null,parties:[],sales:[],page:'dashboard',busy:false};
const money = (value) => `S/ ${Number(value || 0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const options = {year:'numeric',month:'short',day:'numeric'};
const dateText = (value) => new Date(`${value}T12:00:00`).toLocaleDateString('es-PE',options);
const errorText = (error) => error?.code === '23505' ? 'La referencia o el código ya existe en esta empresa.' : (error?.message || 'No se pudo completar la operación.');

function notice(message,problem=false){
  const node=$('feedback');node.textContent=message;node.className=`notice ${problem?'error':'success'}`;
  if(problem) node.scrollIntoView({block:'nearest'});
}
function setBusy(value){state.busy=value;document.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=value);}
function cell(row,value,cls=''){
  const td=document.createElement('td');td.textContent=String(value??'');if(cls)td.className=cls;row.append(td);
}
function empty(tbody,message,colspan){
  const row=document.createElement('tr');const td=document.createElement('td');td.colSpan=colspan;td.className='empty';td.textContent=message;row.append(td);tbody.replaceChildren(row);
}
function canWrite(){return state.memberships.some(m=>m.studio_id===state.company?.studio_id && m.active && ['admin','contador','auxiliar'].includes(m.role) && (!m.company_id||m.company_id===state.company.id));}
function isAdmin(){return state.memberships.some(m=>m.studio_id===state.company?.studio_id && m.active && m.role==='admin' && !m.company_id);}
function show(page){
  state.page=page;const titles={dashboard:'Resumen del estudio',companies:'Empresas',parties:'Terceros',sales:'Ventas internas'};
  $('page-title').textContent=titles[page];$('breadcrumb').textContent=titles[page].toUpperCase();
  document.querySelectorAll('.page').forEach(el=>el.classList.toggle('hidden',el.id!==`${page}-page`));
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  $('company-form-wrap').classList.toggle('hidden',!isAdmin());
  $('party-form-wrap').classList.toggle('hidden',!canWrite());
  $('toggle-sale-form').classList.toggle('hidden',!canWrite());
  if(page==='dashboard')renderDashboard();
  if(page==='companies')renderCompanies();
  if(page==='parties')renderParties();
  if(page==='sales')renderSales();
}
function renderCompanies(){
  const wrap=$('companies-list');wrap.replaceChildren();
  state.companies.forEach(company=>{
    const card=document.createElement('button');card.type='button';card.className=`company-card ${company.id===state.company?.id?'selected':''}`;
    const sector=document.createElement('small');sector.textContent=company.sector.toUpperCase();
    const name=document.createElement('strong');name.textContent=company.name;
    const code=document.createElement('span');code.textContent=company.reference_code;
    card.append(sector,name,code);card.addEventListener('click',()=>switchCompany(company.id));wrap.append(card);
  });
}
function renderParties(){
  const tbody=$('parties-list');tbody.replaceChildren();
  if(!state.parties.length){empty(tbody,'Todavía no hay terceros registrados.',3);return;}
  state.parties.forEach(p=>{const row=document.createElement('tr');cell(row,p.reference_code);cell(row,p.name);cell(row,new Date(p.created_at).toLocaleDateString('es-PE'));tbody.append(row);});
}
function renderSales(){
  const tbody=$('sales-list');tbody.replaceChildren();
  if(!state.sales.length){empty(tbody,'No hay borradores para esta empresa.',6);return;}
  const parties=new Map(state.parties.map(p=>[p.id,p.name]));
  state.sales.forEach(s=>{const row=document.createElement('tr');cell(row,dateText(s.issued_on));cell(row,s.reference);cell(row,parties.get(s.counterparty_id)||'—');cell(row,s.status);cell(row,money(s.base_amount),'right');cell(row,money(s.total_amount),'right strong');tbody.append(row);});
}
function renderDashboard(){
  $('company-name').textContent=state.company?.name||'';
  $('metric-count').textContent=String(state.sales.length);
  $('metric-total').textContent=money(state.sales.reduce((sum,s)=>sum+Number(s.total_amount),0));
  $('metric-parties').textContent=String(state.parties.length);
  const tbody=$('recent-sales');tbody.replaceChildren();
  if(!state.sales.length){empty(tbody,'Aún no hay movimientos. Crea el primer borrador de venta.',5);return;}
  const parties=new Map(state.parties.map(p=>[p.id,p.name]));
  state.sales.slice(0,6).forEach(s=>{const row=document.createElement('tr');cell(row,dateText(s.issued_on));cell(row,s.reference);cell(row,parties.get(s.counterparty_id)||'—');cell(row,s.status);cell(row,money(s.total_amount),'right strong');tbody.append(row);});
}
function fillCompanyPicker(){
  const select=$('company-select');select.replaceChildren();
  state.companies.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=`${c.reference_code} · ${c.name}`;select.append(o);});
  if(state.company)select.value=state.company.id;
}
function fillPartyPicker(){
  const select=$('sale-party');select.replaceChildren();
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Seleccionar tercero';select.append(placeholder);
  state.parties.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=`${p.reference_code} · ${p.name}`;select.append(o);});
}
async function loadMembers(){
  const {data,error}=await state.client.from('memberships').select('studio_id,company_id,role,active').eq('user_id',state.user.id);
  if(error)throw error;state.memberships=data||[];
  if(!state.memberships.length)throw new Error('Tu cuenta no tiene acceso asignado. Contacta al administrador del estudio.');
}
async function loadCompanies(){
  const {data,error}=await state.client.from('companies').select('id,studio_id,name,reference_code,sector').order('name');
  if(error)throw error;state.companies=data||[];
  if(!state.companies.length)throw new Error('Todavía no hay empresas asignadas a tu cuenta.');
  state.company=state.companies.find(c=>c.id===state.company?.id)||state.companies[0];fillCompanyPicker();
}
async function loadCompanyData(){
  const id=state.company?.id;if(!id)return;
  const [parties,sales]=await Promise.all([
    state.client.from('counterparties').select('id,company_id,reference_code,name,created_at').eq('company_id',id).order('name'),
    state.client.from('sales').select('id,company_id,counterparty_id,reference,issued_on,status,base_amount,total_amount').eq('company_id',id).order('created_at',{ascending:false}).limit(500)
  ]);
  if(parties.error)throw parties.error;if(sales.error)throw sales.error;
  if(id!==state.company?.id)return;
  state.parties=parties.data||[];state.sales=sales.data||[];fillPartyPicker();show(state.page);
}
async function switchCompany(id){
  state.company=state.companies.find(c=>c.id===id);fillCompanyPicker();
  state.parties=[];state.sales=[];$('sale-form-wrap').classList.add('hidden');
  try{await loadCompanyData();}catch(e){notice(errorText(e),true);}
}
async function enter(user){
  state.user=user;$('user-email').textContent=user.email||'Usuario';
  try{await loadMembers();await loadCompanies();await loadCompanyData();$('login-wrap').classList.add('hidden');$('app-shell').classList.remove('hidden');}
  catch(e){$('app-shell').classList.add('hidden');$('login-wrap').classList.remove('hidden');$('login-error').textContent=errorText(e);$('login-error').classList.remove('hidden');}
}
async function handleLogin(event){
  event.preventDefault();if(state.busy)return;setBusy(true);$('login-error').classList.add('hidden');
  const email=$('email').value.trim(),password=$('password').value;
  try{const {data,error}=await state.client.auth.signInWithPassword({email,password});if(error)throw error;$('password').value='';await enter(data.user);}
  catch(e){$('login-error').textContent='No se pudo iniciar sesión. Revisa tus datos o consulta al administrador.';$('login-error').classList.remove('hidden');}
  finally{setBusy(false);}
}
async function handleCompany(event){
  event.preventDefault();if(state.busy||!isAdmin())return;setBusy(true);
  const form=new FormData(event.currentTarget);
  try{
    const {error}=await state.client.from('companies').insert({studio_id:state.company.studio_id,reference_code:String(form.get('reference_code')).trim().toUpperCase(),name:String(form.get('name')).trim(),sector:form.get('sector')});
    if(error)throw error;event.currentTarget.reset();await loadCompanies();await loadCompanyData();notice('Empresa creada correctamente.');
  }catch(e){notice(errorText(e),true);}finally{setBusy(false);}
}
async function handleParty(event){
  event.preventDefault();if(state.busy||!canWrite())return;setBusy(true);const form=new FormData(event.currentTarget);
  try{
    const {error}=await state.client.from('counterparties').insert({company_id:state.company.id,reference_code:String(form.get('reference_code')).trim().toUpperCase(),name:String(form.get('name')).trim()});
    if(error)throw error;event.currentTarget.reset();await loadCompanyData();notice('Tercero guardado correctamente.');
  }catch(e){notice(errorText(e),true);}finally{setBusy(false);}
}
function addLine(){const node=$('line-template').content.firstElementChild.cloneNode(true);node.querySelector('.remove-line').addEventListener('click',()=>{if($('lines').children.length>1){node.remove();updatePreview();}});node.querySelectorAll('input,select').forEach(x=>x.addEventListener('input',updatePreview));$('lines').append(node);updatePreview();}
function readLines(){return [...$('lines').children].map(row=>({description:row.querySelector('.line-description').value.trim(),quantity:Number(row.querySelector('.line-quantity').value),unit_price:Number(row.querySelector('.line-price').value),example_tax_rate:Number(row.querySelector('.line-tax').value)}));}
function updatePreview(){let total=0;for(const l of readLines()){const base=Math.round(l.quantity*l.unit_price*100)/100;total+=base+Math.round(base*l.example_tax_rate)/100;}$('sale-preview').textContent=`Total ilustrativo: ${money(total)}`;}
async function handleSale(event){
  event.preventDefault();if(state.busy||!canWrite())return;
  const form=new FormData(event.currentTarget),lines=readLines();
  if(!lines.length||lines.some(l=>!l.description||!Number.isFinite(l.quantity)||l.quantity<=0||!Number.isFinite(l.unit_price)||l.unit_price<=0)){notice('Completa los conceptos, cantidades y precios.',true);return;}
  setBusy(true);
  try{
    const {error}=await state.client.rpc('create_sale_draft',{p_company:state.company.id,p_counterparty:form.get('counterparty_id'),p_request:crypto.randomUUID(),p_reference:String(form.get('reference')).trim(),p_date:form.get('issued_on'),p_lines:lines});
    if(error)throw error;event.currentTarget.reset();$('lines').replaceChildren();addLine();$('sale-form-wrap').classList.add('hidden');await loadCompanyData();notice('Borrador interno guardado. No se emitió ningún comprobante.');
  }catch(e){notice(errorText(e),true);}finally{setBusy(false);}
}
async function boot(){
  if(!SUPABASE_URL||!SUPABASE_PUBLISHABLE_KEY){$('login-error').textContent='Falta configurar el proyecto del piloto. Consulta el README.';$('login-error').classList.remove('hidden');$('login-form').querySelector('button').disabled=true;return;}
  state.client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
  const {data:{user},error}=await state.client.auth.getUser();if(!error&&user)await enter(user);
}
$('login-form').addEventListener('submit',handleLogin);
$('company-form').addEventListener('submit',handleCompany);
$('party-form').addEventListener('submit',handleParty);
$('sale-form').addEventListener('submit',handleSale);
$('company-select').addEventListener('change',e=>switchCompany(e.target.value));
$('logout').addEventListener('click',async()=>{await state.client.auth.signOut();state.user=null;state.company=null;state.parties=[];state.sales=[];$('app-shell').classList.add('hidden');$('login-wrap').classList.remove('hidden');$('password').value='';});
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>show(b.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.goto)));
$('toggle-sale-form').addEventListener('click',()=>{$('sale-form-wrap').classList.toggle('hidden');});
$('add-line').addEventListener('click',addLine);
$('sale-date').value=new Date().toLocaleDateString('en-CA');addLine();boot();
