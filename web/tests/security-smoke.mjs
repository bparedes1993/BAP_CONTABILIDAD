// Run only against a disposable pilot project after SQL setup and two invited users.
// Required environment variables: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
// TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_READER_EMAIL, TEST_READER_PASSWORD.
import assert from 'node:assert/strict';

const env=process.env;
for(const key of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','TEST_ADMIN_EMAIL','TEST_ADMIN_PASSWORD','TEST_READER_EMAIL','TEST_READER_PASSWORD']){
  if(!env[key])throw new Error(`Missing ${key}`);
}
const url=env.SUPABASE_URL.replace(/\/$/,'');
async function login(email,password){
  const res=await fetch(`${url}/auth/v1/token?grant_type=password`,{
    method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({email,password})
  });
  if(!res.ok)throw new Error(`Authentication failed (${res.status})`);
  return (await res.json()).access_token;
}
async function request(token,path,method='GET',body){
  const res=await fetch(`${url}/rest/v1/${path}`,{
    method,headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`,
      'Content-Type':'application/json',Prefer:'return=representation'},
    body:body?JSON.stringify(body):undefined
  });
  return {status:res.status,data:await res.json().catch(()=>null)};
}
const [admin,reader]=await Promise.all([
  login(env.TEST_ADMIN_EMAIL,env.TEST_ADMIN_PASSWORD),
  login(env.TEST_READER_EMAIL,env.TEST_READER_PASSWORD)
]);
const a=await request(admin,'companies?select=id,studio_id,reference_code');
const r=await request(reader,'companies?select=id,studio_id,reference_code');
assert.equal(a.status,200);assert.equal(r.status,200);
assert.equal(a.data.length,5,'Seed must create exactly five companies for the administrator');
assert.equal(r.data.length,1,'Reader must be scoped to exactly one company');
const other=a.data.find(c=>c.id!==r.data[0].id);
assert.ok(other,'Expected an inaccessible second company');
const otherSales=await request(reader,`sales?select=id,company_id&company_id=eq.${other.id}`);
assert.equal(otherSales.status,200);assert.deepEqual(otherSales.data,[]);
for(const table of ['counterparties','sale_lines']){
  const rows=await request(reader,`${table}?select=id,company_id&company_id=eq.${other.id}`);
  assert.equal(rows.status,200);assert.deepEqual(rows.data,[],`${table} leaks a different company`);
}
const anon=await fetch(`${url}/rest/v1/companies?select=id`,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY}});
assert.ok(anon.status>=400,'Anonymous access to companies must be denied');
const attempt=await request(reader,'counterparties','POST',{
  company_id:other.id,reference_code:'SHOULD-NOT-WRITE',name:'Forbidden'
});
assert.ok(attempt.status>=400,`Unauthorized insert returned ${attempt.status}`);
const ownAttempt=await request(reader,'counterparties','POST',{
  company_id:r.data[0].id,reference_code:'SHOULD-NOT-WRITE',name:'Forbidden'
});
assert.ok(ownAttempt.status>=400,'Reader cannot write even to own company');
const directSale=await request(admin,'sales','POST',{
  company_id:a.data[0].id,counterparty_id:crypto.randomUUID(),request_id:crypto.randomUUID(),
  reference:'SHOULD-NOT-WRITE',issued_on:'2026-09-25',base_amount:1,example_tax:0,total_amount:1,
  created_by:crypto.randomUUID()
});
assert.ok(directSale.status>=400,'Even admin must use server-validated draft RPC');
const rpc=await request(reader,'rpc/create_sale_draft','POST',{
  p_company:other.id,p_counterparty:'00000000-0000-0000-0000-000000000001',
  p_request:crypto.randomUUID(),p_reference:'FORBIDDEN',p_date:'2026-09-25',
  p_lines:[{description:'Forbidden',quantity:1,unit_price:1,example_tax_rate:0}]
});
assert.ok(rpc.status>=400,'Cross-company RPC should be denied');
console.log('PASS: five-company seed, reader isolation, anonymous denial, direct write denial and RPC denial');
