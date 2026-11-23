// CliQo local QA. Uses only disposable accounts and isolated TST inventory.
import assert from "node:assert/strict";
import {createHash, createHmac, randomBytes, randomUUID} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {createClient} from "@supabase/supabase-js";
import {createServerClient} from "@supabase/ssr";
import {strFromU8, unzipSync} from "fflate";
import pg from "pg";
import sharp from "sharp";
import {chromium} from "playwright";

const envFile = Object.fromEntries((await readFile(".env.local","utf8")).split("\n")
  .filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const at = line.indexOf("=");
    return [line.slice(0, at), line.slice(at + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
const base = process.env.CLIQO_TEST_URL ?? "http://localhost:4176";
for (const url of [base, envFile.NEXT_PUBLIC_SUPABASE_URL, envFile.CLIQO_DATABASE_URL]) {
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local environments only");
}
Object.assign(process.env, envFile);
const {activationCodeForPrint} = await import("../lib/print-piece-identity.ts");
const db = new pg.Client({connectionString: envFile.CLIQO_DATABASE_URL});
const admin = createClient(envFile.NEXT_PUBLIC_SUPABASE_URL, envFile.SUPABASE_SECRET_KEY, {auth:{persistSession:false}});
const browser = await chromium.launch({channel:"chrome",headless:true});
const users = [];
const output = "output/product-order-qa";
const orderIds = [];
const storagePaths = [];
const adSpendCampaigns = [];
await mkdir(output,{recursive:true});

function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/=+$/, "")) bits += alphabet.indexOf(character.toUpperCase()).toString(2).padStart(5, "0");
  const key = Buffer.from((bits.match(/.{8}/g) || []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", key).update(counter).digest(), offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function createAccount(role) {
  const email = `cliqo-checkout-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString("hex");
  const created = await admin.auth.admin.createUser({email, password, email_confirm: true});
  if (created.error) throw new Error("Could not create a local test account");
  const id = created.data.user.id; users.push(id);
  if (role) await db.query("insert into public.staff_members(user_id,display_name,role) values($1,$2,$3)", [id, "Local test owner", role]);

  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  let cookies = [];
  const auth = createServerClient(envFile.NEXT_PUBLIC_SUPABASE_URL, envFile.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: {name: "sb-cliqo-auth-token"},
    cookies: {getAll: () => [], setAll: (values) => { cookies = values; }},
  });
  const signedIn = await auth.auth.signInWithPassword({email, password});
  if (signedIn.error) throw new Error("Could not sign in a local test account");
  if (role) {
    const enrolled = await auth.auth.mfa.enroll({factorType: "totp"});
    if (enrolled.error) throw new Error("Could not enroll local owner MFA");
    const challenge = await auth.auth.mfa.challenge({factorId: enrolled.data.id});
    if (challenge.error) throw new Error("Could not challenge local owner MFA");
    const verified = await auth.auth.mfa.verify({factorId: enrolled.data.id, challengeId: challenge.data.id, code: totp(enrolled.data.totp.secret)});
    if (verified.error) throw new Error("Could not verify local owner MFA");
  }
  await context.addCookies(cookies.map((cookie) => ({
    name: cookie.name, value: cookie.value, url: base, httpOnly: cookie.options?.httpOnly ?? false, sameSite: "Lax",
  })));
  await context.addCookies([{name: "cliqo-locale", value: "en", url: base}]);
  const page = await context.newPage();
  page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(180000);
  return {id, context, page, auth};
}


const destinations = {
  review: "https://maps.google.com/?q=CliQo-QA",
  instagram: "https://www.instagram.com/cliqoqa/",
  facebook: "https://www.facebook.com/cliqoqa/",
  tiktok: "https://www.tiktok.com/@cliqoqa",
};
const uniqueQr = new Set();
const coverage = [];

async function createOrder(context, items) {
  const response = await context.request.post(base + "/api/orders", {data:{
    items, requestKey: randomBytes(32).toString("hex"), name:"CliQo QA",
    phone:"+201000000000", address:{governorate:"Cairo",city:"QA",street:"Fixture only"},
  }});
  assert.equal(response.status(),201,await response.text());
  return recordOrder(await response.json());
}

async function recordOrder({reference,statusPath}) {
  const {rows:[order]} = await db.query("select id, payment_method, shipping_minor, email_snapshot from public.orders where order_reference=$1",[reference]);
  orderIds.push(order.id);
  assert.deepEqual([order.payment_method,order.shipping_minor,order.email_snapshot],["test",0,null]);
  return {...order,reference,statusPath};
}

async function board(page,order) {
  await page.goto(base + "/cliqo-control/orders?q=" + order.reference);
  await page.locator(".kanban-card").filter({hasText:order.reference}).waitFor();
  return page.locator(".kanban-card").filter({hasText:order.reference});
}

async function move(page,order,state) {
  const card=await board(page,order),target=page.locator(`.kanban-column[data-order-status="${state}"]`);
  await card.dragTo(target.locator("header"));
  await page.waitForFunction(({ref,state}) => document.querySelector(`.kanban-column[data-order-status="${state}"]`)?.textContent.includes(ref), {ref:order.reference,state});
  const {rows:[row]}=await db.query("select state from public.orders where id=$1",[order.id]);
  assert.equal(row.state,state);
}

async function zipFor(owner, order, line) {
  const response=await owner.context.request.get(base + `/cliqo-control/orders/${order.id}/production?line=${line.id}`);
  assert.equal(response.status(),200,`${line.sku_code_snapshot}: ${response.status()}`);
  assert.match(response.headers()["content-disposition"],/filename="TEST-/);
  const bytes = await response.body();
  return {bytes,files:unzipSync(bytes)};
}

try {
  await db.connect();
  const {rows:[config]} = await db.query("select sales_enabled,cod_enabled,card_enabled from app_private.checkout_config where id");
  assert.deepEqual(config,{sales_enabled:false,cod_enabled:false,card_enabled:false});
  const owner=await createAccount("owner");
  await owner.page.goto(base+"/cliqo-control");await owner.page.locator(".overview-page").waitFor();
  assert.equal(await owner.page.locator(".overview-export").count(),1);
  const campaign="QA " + randomUUID();adSpendCampaigns.push(campaign);
  await owner.page.locator('.overview-spend-form input[name="campaign"]').fill(campaign);
  await owner.page.locator('.overview-spend-form input[name="amount"]').fill("12.34");
  await owner.page.locator('.overview-spend-form button[type="submit"]').click();
  await owner.page.locator(".overview-spend-notice").waitFor();
  const spend=(await db.query("select id,amount_minor from app_private.admin_ad_spend where campaign=$1",[campaign])).rows[0];assert.equal(spend.amount_minor,1234);
  const report=await owner.context.request.get(base+"/api/admin/sales-export?period=7d");assert.equal(report.status(),200);
  const workbook=unzipSync(await report.body());assert.ok(strFromU8(workbook["xl/workbook.xml"]).includes('name="الطلبات"'));
  assert.equal(Object.keys(workbook).filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name)).length,4);
  assert.ok(strFromU8(workbook["xl/worksheets/sheet4.xml"]).includes(campaign));
  console.log("PASS overview records manual ad spend and Excel export contains four report sheets");
  const inboxChecks=[];
  const mailboxesConfigured=["CLIQO_MAIL_INFO_PASSWORD","CLIQO_MAIL_CONTACTS_PASSWORD","CLIQO_MAIL_ADMIN_PASSWORD"].every(name=>Boolean(envFile[name])&&!envFile[name].startsWith("replace-with-"));
  const firstInbox=owner.page.waitForResponse(response=>response.url().includes("/api/admin/mail?box=info")&&response.request().method()==="GET");
  await owner.page.goto(base+"/cliqo-control/email");await owner.page.locator(".admin-mail-workspace").waitFor();
  const infoInbox=await firstInbox;inboxChecks.push(["info",infoInbox]);
  const tabs=owner.page.getByRole("tab");assert.equal(await tabs.count(),3);
  for(const [index,box] of [[1,"contacts"],[2,"admin"]]){const response=owner.page.waitForResponse(candidate=>candidate.url().includes(`/api/admin/mail?box=${box}`)&&candidate.request().method()==="GET");await tabs.nth(index).click();inboxChecks.push([box,await response]);}
  for(const [box,response] of inboxChecks){if(mailboxesConfigured){assert.equal(response.status(),200,`mailbox ${box}`);const payload=await response.json();assert.ok(Array.isArray(payload.messages));assert.equal(typeof payload.total,"number");}else assert.equal(response.status(),503,`mailbox ${box} reports unavailable without local credentials`);}
  const mailboxReport=await owner.context.request.get(base+"/api/admin/mail/report");if(mailboxesConfigured){assert.equal(mailboxReport.status(),200);const mailboxCsv=await mailboxReport.text();for(const address of ["info@cliqoeg.com","contacts@cliqoeg.com","admin@cliqoeg.com"])assert.ok(mailboxCsv.includes(address));}else assert.equal(mailboxReport.status(),503);
  if(!mailboxesConfigured)await owner.page.locator(".admin-mail-notice").waitFor();
  console.log(mailboxesConfigured?"PASS read-only inbox checks for all three mailboxes and CSV report; no message sent":"PASS all three inboxes show a graceful unavailable state; local mailbox credentials are not configured; no message sent");
  const buyer=await createAccount();
  const visitor=await browser.newContext();

  await owner.page.goto(base + "/cliqo-control/orders");
  await Promise.all([
    owner.page.waitForURL("**/products"),
    owner.page.locator('form[action$="/test-store"] button').click({timeout:60000}),
  ]);
  const testCookies=(await owner.context.cookies()).filter(cookie=>cookie.name==="cliqo-test-checkout");
  assert.equal(testCookies.length,1);
  await buyer.context.addCookies(testCookies);

  await buyer.page.goto(base+"/products");
  const designs=await buyer.page.locator(".shop-card").evaluateAll(cards=>cards.map(card=>({href:card.getAttribute("href"),title:card.querySelector("h2").textContent})));
  assert.equal(designs.length,19);
  const variants=[];
  for(const design of designs){
    await buyer.page.goto(base+design.href);
    await buyer.page.locator(".add-to-cart").waitFor();
    const finishes=buyer.page.locator(".shop-design-finish button");
    const count=await finishes.count();
    for(let finish=0;finish<Math.max(1,count);finish++){
      if(count) await finishes.nth(finish).click();
      const url=new URL(buyer.page.url());
      variants.push({id:url.searchParams.get("design"),href:url.pathname+url.search,title:design.title});
      await buyer.page.locator(".add-to-cart").click();
      await buyer.page.waitForFunction(count => JSON.parse(localStorage.getItem("cliqo-test-cart-v1") ?? "[]").length === count, variants.length);
    }
  }
  const cart=await buyer.page.evaluate(()=>JSON.parse(localStorage.getItem("cliqo-test-cart-v1")));
  assert.equal(variants.length,20); assert.equal(cart.length,variants.length);
  console.log("PASS 19 catalog designs, 20 variants added from actual product pages");

  await buyer.page.goto(base+"/checkout");
  const form=buyer.page.locator("form.checkout-form");
  for(const [field,value] of Object.entries({name:"CliQo QA",phone:"01000000000",governorate:"Cairo",city:"QA",street:"Fixture only"})) {
    await form.locator(`[name=${field}]`).fill(value);
  }
  const [checkoutResponse]=await Promise.all([
    buyer.page.waitForResponse(response => response.url().endsWith("/api/orders") && response.request().method()==="POST"),
    form.locator('button[type=submit]').click(),
  ]);
  assert.equal(checkoutResponse.status(),201);
  await buyer.page.waitForURL("**/orders/*");
  const statusPath=new URL(buyer.page.url()).pathname;
  const order=await recordOrder({reference:statusPath.split("/").at(-1),statusPath});
  const fresh=await board(owner.page,order);
  const confirmed=owner.page.locator(".kanban-column").nth(1);
  await fresh.dragTo(confirmed.locator("header"));
  await confirmed.getByText(order.reference).waitFor();
  await owner.page.screenshot({path:output+"/kanban-desktop.png"});

  const {rows:units}=await db.query(`select l.id,l.sku_id,l.sku_code_snapshot,l.options_snapshot,l.product_name_snapshot,
    i.public_id,t.print_nonce from public.order_lines l join public.smart_items i on i.order_line_id=l.id
    join public.smart_item_activation_tokens t on t.smart_item_id=i.id where l.order_id=$1`,[order.id]);
  assert.equal(units.length,20);
  const profile=await buyer.auth.rpc("save_merchant_page",{
    p_page_id:null,p_display_name:"CliQo QA links",p_short_description:"Local fixture",
    p_avatar_path:null,p_cover_path:null,p_is_published:true,
    p_links:[{id:null,label:"QA Link",destination_url:"https://example.com/cliqo-qa",is_enabled:true}],
  });
  assert.equal(profile.error,null);
  for (const line of units) {
    const {face,variant}=line.options_snapshot;
    const itemUrl=base+"/s/"+line.public_id;
    const {bytes,files}=await zipFor(owner,order,line);
    const manifest=strFromU8(files["units.tsv"]);
    assert.ok(manifest.endsWith(itemUrl));
    assert.equal(Object.keys(files).filter(name=>name.endsWith("qr.svg")).length,1);
    assert.equal(Object.keys(files).filter(name=>/front.png|back.png/.test(name)).length,2);
    const qr=Object.entries(files).find(([name])=>name.endsWith("qr.svg"))[1];
    const itemQr=await owner.context.request.get(base+`/cliqo-control/items/${line.public_id}/qr`);
    assert.equal(itemQr.status(),200);
    assert.match(itemQr.headers()["content-type"],/svg/);
    const qrHash=createHash("sha256").update(qr).digest("hex");
    assert.ok(!uniqueQr.has(qrHash)); uniqueQr.add(qrHash);
    assert.ok(!Object.keys(files).some(name=>/activation/i.test(name)));
    const code=activationCodeForPrint(line.public_id,Number(line.print_nonce));
    assert.match(code,/^[0-9]{6}$/);
    {
      await buyer.page.goto(base+"/activate?item="+line.public_id);
      await buyer.page.locator('[data-testid="activation-form"][data-hydrated="true"] #activation:not([disabled])').fill(code);
      await buyer.page.locator('[data-testid="activation-form"] button[type=submit]').click();
      await buyer.page.waitForURL("**/dashboard/items/"+line.public_id);
    }
    const reuse=await buyer.auth.rpc("claim_stand_activation",{p_token_hash:createHash("sha256").update(code).digest("hex"),p_public_id:line.public_id});
    assert.equal(reuse.data,false);
    await buyer.page.goto(base+"/dashboard/items/"+line.public_id);
    const form=buyer.page.locator(".customer-item-form");
    const pay=face==="instapay"||face==="vodafone";
    if(pay) {
      await form.locator('[name=recipientLabel]').fill("CliQo QA recipient");
      await form.locator('[name=paymentIdentifier]').fill(face==="instapay"?"cliqoqa@instapay":"01000000000");
    } else if(face==="all-in-one") await form.locator('[name=pageId]').selectOption(profile.data);
    else await form.locator('[name=destinationUrl]').fill(destinations[face]);
    await form.locator('button[type=submit]').click();
    await form.getByRole("status").waitFor();
    assert.match(await form.getByRole("status").innerText(), /saved|تم حفظ/i);
    let response=await visitor.request.get(itemUrl,{maxRedirects:0});
    if (pay) {
      assert.equal(response.status(),200);
      assert.match(await response.text(),/CliQo QA recipient/);
    } else if (face==="all-in-one") {
      assert.equal(response.status(),200);
      assert.match(await response.text(),/CliQo QA links/);
    } else {
      assert.ok([302,307].includes(response.status()),face);
      assert.equal(response.headers().location,destinations[face]);
    }
    await writeFile(output+`/${line.sku_code_snapshot}.zip`,bytes);
    coverage.push([line.product_name_snapshot,face,variant,line.sku_code_snapshot]);
    console.log("PASS",line.product_name_snapshot,variant,"ZIP, QR, one-time activation, public destination");
  }

  const {rows:[customSku]}=await db.query(`select
    max(id::text) filter(where options->>'design'='T1') as t1,
    max(id::text) filter(where options->>'design'='T2') as t2
    from public.product_skus where checkout_test and options->>'face'='all-in-one'
    and product_family_id=(select id from public.product_families where family_key='stand')`);
  const custom=await createOrder(buyer.context,[{sku_id:customSku.t1,quantity:1,business_name:"QA artwork",destination_url:"https://example.com"},
    {sku_id:customSku.t2,quantity:1,business_name:"QA custom",destination_url:"https://example.com",design_brief:"Layout proof for a sample"}]);
  await move(owner.page,custom,"confirmed");
  const {rows:customLines}=await db.query("select id,sku_code_snapshot,options_snapshot->>'design' as tier from public.order_lines where order_id=$1",[custom.id]);
  const t1=customLines.find(line=>line.tier==="T1");
  const t2=customLines.find(line=>line.tier==="T2");
  const before=await owner.context.request.get(base+`/cliqo-control/orders/${custom.id}/production?line=${t1.id}`);
  assert.equal(before.status(),409);
  const image=await sharp({create:{width:80,height:80,channels:3,background:"#ffffff"}}).png().toBuffer();
  const upload=await buyer.context.request.post(base+custom.statusPath+"/design-files",{multipart:{
    orderLineId:t1.id,file:{name:"qa-artwork.png",mimeType:"image/png",buffer:image},
  }});
  assert.ok(upload.ok(),await upload.text());
  const {rows:files}=await db.query("select storage_path from public.order_files where order_id=$1",[custom.id]);
  storagePaths.push(...files.map(file=>file.storage_path));
  const t1zip=await zipFor(owner,custom,t1);
  const t2zip=await zipFor(owner,custom,t2);
  assert.ok(Object.keys(t1zip.files).some(name=>name.startsWith("originals/")));
  assert.ok(Object.keys(t1zip.files).some(name=>name.endsWith("qr.svg")));
  assert.match(strFromU8(t2zip.files["order.txt"]),/Layout proof/);
  assert.ok(!t2zip.files["units.tsv"]);
  await writeFile(output+"/TEST-T1-artwork.zip",t1zip.bytes);
  await writeFile(output+"/TEST-T2-design.zip",t2zip.bytes);
  console.log("PASS T1 file gate, customer artwork upload, T1 and T2 ZIP");

  const closed=await createOrder(buyer.context,[{sku_id:cart[0].skuId,quantity:1}]);
  await move(owner.page,closed,"cancelled");
  await owner.page.locator(".kanban-open").click();
  await owner.page.getByRole("button",{name:/حذف الطلب الملغي|Delete cancelled order/}).click();
  await owner.page.getByRole("button",{name:/احذف نهائيًا|Delete permanently/}).click();
  await owner.page.locator(".kanban-card").waitFor({state:"detached"});
  assert.equal((await db.query("select count(*)::int as count from public.orders where id=$1",[closed.id])).rows[0].count,0);
  await owner.page.setViewportSize({width:390,height:844});
  await board(owner.page,order);
  assert.equal(await owner.page.evaluate(()=>document.documentElement.scrollWidth),390);
  await owner.page.screenshot({path:output+"/kanban-mobile.png"});
  for (const path of ["", "/products", "/inventory", "/customers", "/email", "/policies", "/settings"]) {
    const response=await owner.page.goto(base+"/cliqo-control"+path,{waitUntil:"domcontentloaded"});
    assert.equal(response.status(),200,path);
    await owner.page.locator(".ops-sidebar").waitFor();
    console.log("PASS admin section",path || "/overview");
  }
  await writeFile(output+"/coverage.json",JSON.stringify(coverage,null,2));
  console.log("PASS Kanban drag/drop, permanent deletion of cancelled order and mobile overflow");
} finally {
  await browser.close();
  if(adSpendCampaigns.length)await db.query("delete from app_private.admin_ad_spend where campaign=any($1::text[])",[adSpendCampaigns]);
  if(storagePaths.length) await admin.storage.from("order-designs").remove(storagePaths);
  if(orderIds.length){
    await db.query("begin");
    try {
      await db.query("delete from public.inventory_movements where order_line_id in (select id from public.order_lines where order_id=any($1::uuid[]))",[orderIds]);
      await db.query(`update public.inventory_balances b set reserved=b.reserved-r.quantity
      from (select sku_id,sum(quantity)::int quantity from public.inventory_reservations
      where order_line_id in (select id from public.order_lines where order_id=any($1::uuid[])) and state='reserved' group by sku_id) r
      where b.sku_id=r.sku_id`,[orderIds]);
      await db.query(`update public.inventory_balances b set on_hand=b.on_hand-r.quantity
      from (select i.sku_id,count(*)::int quantity from public.smart_items i
      where i.order_line_id in (select id from public.order_lines where order_id=any($1::uuid[])) group by i.sku_id) r
      where b.sku_id=r.sku_id`,[orderIds]);
      await db.query("delete from public.smart_items where order_line_id in (select id from public.order_lines where order_id=any($1::uuid[]))",[orderIds]);
      await db.query("delete from public.order_status_events where order_id=any($1::uuid[])",[orderIds]);
      await db.query("delete from public.order_line_status_events where order_line_id in (select id from public.order_lines where order_id=any($1::uuid[]))",[orderIds]);
      await db.query("delete from public.order_notes where order_id=any($1::uuid[])",[orderIds]);
      await db.query("delete from public.orders where id=any($1::uuid[]) and payment_method='test'",[orderIds]);
      await db.query("commit");
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  }
  for(const id of users) await admin.auth.admin.deleteUser(id);
  await db.end();
}
