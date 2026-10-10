// Local demo only. No Supabase session, credentials or remote requests.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{
  try{
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!path.startsWith(root)){res.writeHead(403).end();return;}
    if(path.endsWith('/favicon.ico')){res.writeHead(204).end();return;}
    const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.csv':'text/csv'}[extname(path)]||'application/octet-stream';
    const content=await readFile(path);res.writeHead(200,{'Content-Type':mime,'X-Content-Type-Options':'nosniff'});res.end(content);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[],remote=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',request=>{if(!request.url().startsWith(url))remote.push(request.url());});
  await page.goto(`${url}/demo.html`);await page.waitForFunction(()=>document.getElementById('metric-count').textContent==='3');
  await page.locator('[data-page="imports"]').click();await page.locator('#import-example').click();
  await page.waitForFunction(()=>!document.getElementById('import-confirm').disabled);
  await page.locator('#import-confirm').click();assert.equal(await page.locator('#metric-count').textContent(),'5');
  await page.locator('#import-example').click();await page.waitForFunction(()=>document.getElementById('import-summary').textContent.includes('2 duplicados'));
  assert.equal(await page.locator('#import-confirm').isDisabled(),true);
  await page.locator('[data-page="money"]').click();
  const purchase=page.locator('#purchase-form');
  for(const [name,value] of Object.entries({reference:'C-UI',supplier:'Proveedor UI Ficticio',issuedOn:'2026-10-10',dueOn:'2026-10-15',base:'100',tax:'18'}))await purchase.locator(`[name="${name}"]`).fill(value);
  await purchase.locator('button').click();assert.equal(await page.locator('#purchase-list tr').count(),3);
  const movement=page.locator('#movement-form');
  await movement.locator('[name="amount"]').fill('999999');await movement.locator('[name="externalReference"]').fill('OPERACION-UI');
  await page.locator('#movement-submit').click();assert.match(await page.locator('#money-feedback').textContent(),/supera el saldo/);assert.equal(await page.locator('#movement-list tr').count(),0);
  await movement.locator('[name="amount"]').fill('59');await page.locator('#movement-submit').click();
  assert.equal(await page.locator('#session-cash-delta').textContent(),'S/ 59.00');
  await page.locator('#reversal-form [name="reason"]').fill('Aplicado por error de prueba');await page.locator('#reversal-submit').click();
  assert.equal(await page.locator('#session-cash-delta').textContent(),'S/ 0.00');assert.equal(await page.locator('#movement-list tr').count(),2);
  await page.locator('#movement-kind').selectOption('purchase');await page.locator('#movement-document').selectOption('C-UI');
  await movement.locator('[name="amount"]').fill('118');await movement.locator('[name="externalReference"]').fill('PAGO-UI');await page.locator('#movement-submit').click();
  const row=page.locator('#purchase-list tr').filter({hasText:'C-UI'});assert.equal(await row.locator('td').nth(5).textContent(),'S/ 0.00');
  assert.equal(await page.locator('#session-cash-delta').textContent(),'S/ -118.00');
  await page.locator('#company-select').selectOption('1');assert.equal(await page.locator('#movement-list tr').count(),0);assert.equal(await page.locator('#purchase-list tr').count(),2);
  await page.locator('#company-select').selectOption('0');
  // A hostile label remains text, even after importing and rendering in other sections.
  const csv='empresa,referencia,cliente,fecha_emision,fecha_vencimiento,base,impuesto,cobrado\nDEMO-001,XSS-01,<img src=x onerror=window.__attack=1>,2026-10-10,2026-10-15,10,0,0';
  await page.locator('[data-page="imports"]').click();await page.locator('#import-file').setInputFiles({name:'hostile-demo.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await page.waitForFunction(()=>!document.getElementById('import-confirm').disabled);await page.locator('#import-confirm').click();
  assert.equal(await page.locator('#parties-list img').count(),0);assert.equal(await page.evaluate(()=>window.__attack),undefined);
  for(const name of ['dashboard','companies','parties','sales','imports','money','finance']){await page.locator(`[data-page="${name}"]`).click();assert.equal(await page.locator(`#${name}-page`).isVisible(),true);}
  if(process.env.UI_SCREENSHOT_DIR){await mkdir(process.env.UI_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.UI_SCREENSHOT_DIR,'finance-desktop.png'),fullPage:true});}
  const mobile=await browser.newPage({viewport:{width:390,height:844}});mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(`${url}/demo.html`);await mobile.waitForFunction(()=>document.getElementById('metric-count').textContent==='3');
  for(const name of ['dashboard','imports','money','finance']){
    await mobile.locator(`[data-page="${name}"]`).click();assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`Page overflow: ${name}`);
  }
  if(process.env.UI_SCREENSHOT_DIR)await mobile.screenshot({path:join(process.env.UI_SCREENSHOT_DIR,'finance-mobile.png'),fullPage:true});
  await page.reload();await page.waitForFunction(()=>document.getElementById('metric-count').textContent==='3');
  assert.equal(await page.locator('#movement-list tr').count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
  console.log('PASS UI: import/reimport, purchase, overpayment denial, collection, reversal, payment, company scope, inert hostile label, navigation, mobile layout and reset on reload');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
