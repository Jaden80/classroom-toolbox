import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const require=createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
const content='BT /F1 12 Tf 72 720 Td (Hello PDF 123!) Tj ET';
objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
const start=pdf.length;pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
const browser=await chromium.launch({headless:true,channel:"msedge"});const page=await browser.newPage();
const requests=[],errors=[];page.on('request',r=>requests.push({url:r.url(),method:r.method()}));page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8000/#/pdf');
await page.locator('#pdf-file').setInputFiles({name:'sample.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf)});
await page.waitForFunction(()=>document.querySelector('#pdf-status').textContent.includes('계산 완료')||document.querySelector('#pdf-error').textContent,{timeout:30000});
const result=await page.locator('#pdf').innerText();console.log(result);
if(await page.locator('#pdf-with').textContent()!=='14'||await page.locator('#pdf-without').textContent()!=='12')throw Error('Incorrect count');
await page.screenshot({path:'pdf-preview.png',fullPage:true});
await page.locator('#pdf-clear').click();if(await page.locator('#pdf-text').inputValue()!=='')throw Error('Clear failed');
await page.locator('#pdf-file').setInputFiles({name:'bad.pdf',mimeType:'application/pdf',buffer:Buffer.from('broken')});await page.waitForFunction(()=>document.querySelector('#pdf-error').textContent);
await page.locator('#pdf .back').click();await page.waitForSelector('#hub',{state:'visible'});
if(await page.locator('.tool').count()!==3)throw Error('Hub missing tool');
if(requests.some(r=>!r.url.startsWith('http://127.0.0.1:8000/')||r.method!=='GET'))throw Error('Unexpected network');
console.log(JSON.stringify({errors,requests:requests.length,allRequestsLocalGET:true,invalidPdf:true,clear:true,hub:true}));
await browser.close();if(errors.length)process.exitCode=1;

