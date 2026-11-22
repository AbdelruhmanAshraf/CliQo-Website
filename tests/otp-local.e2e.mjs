import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import pg from 'pg';
import {chromium} from 'playwright';
const env = Object.fromEntries((await readFile(new URL('../.env.local', import.meta.url), 'utf8')).split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
const base=process.env.CLIQO_TEST_URL || 'http://localhost:4173';
for(const url of [base,env.NEXT_PUBLIC_SUPABASE_URL,env.CLIQO_DATABASE_URL]) assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
const mail='http://127.0.0.1:54334';
const email=`cliqo-otp-${randomUUID()}@example.invalid`;
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const db=new pg.Client({connectionString:env.CLIQO_DATABASE_URL});await db.connect();
const browser=await chromium.launch({channel:'chrome',headless:true});let messageId;
try {
 const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(60000);
 await page.goto(base+'/login');await page.locator('#login-email:not([disabled])').fill(email);
 await page.locator('form button[type=submit]').click();await page.locator('#login-code').waitFor();
 let message;
 for(let attempt=0;attempt<20;attempt++){
  const list=await (await fetch(mail+'/api/v1/messages',{signal:AbortSignal.timeout(10000)})).json();
  message=list.messages.find(m=>m.To?.some(to=>to.Address===email));
  if(message)break;await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert.ok(message,'OTP arrives in local Mailpit');messageId=message.ID;
 const contents=await (await fetch(mail+'/api/v1/message/'+messageId)).json();
 assert.match(contents.HTML,/CliQo/);
 const code=contents.HTML.match(/>\s*(\d{6})\s*</)?.[1];assert.ok(code,'Branded email contains six-digit OTP');
 await page.locator('#login-code').fill(code);await page.locator('form button[type=submit]').click();await page.waitForURL('**/dashboard');
 assert.equal(new URL(page.url()).pathname,'/dashboard');
 const replay=await createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}}).auth.verifyOtp({email,token:code,type:'email'});
 assert.ok(replay.error,'OTP cannot be reused');
 console.log('Local OTP passed: signup → branded Mailpit email → browser login → used-code rejection.');
}finally{
 await browser.close();
 const {rows}=await db.query('select id from auth.users where email=$1',[email]);
 for(const row of rows){const result=await admin.auth.admin.deleteUser(row.id);assert.equal(result.error,null);}
 if(messageId)assert.ok((await fetch(mail+'/api/v1/messages',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({IDs:[messageId]})})).ok);
 await db.end();
}
