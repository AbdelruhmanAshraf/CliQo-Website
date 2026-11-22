import {test} from "node:test";
import assert from "node:assert/strict";
import {buildOrderEmail} from "../lib/email-templates";

const shared = {
  eventType: "order_received" as const,
  reference: "CQ-100042",
  customerName: "<img src=x onerror=alert(1)>",
  state: "new",
  paymentState: "cod_to_collect",
  paymentMethod: "cod",
  subtotalMinor: 12_500,
  shippingMinor: 3_000,
  totalMinor: 15_500,
  lines: [{product_name_snapshot: "ستاند NFC", quantity: 1, line_total_minor: 12_500}],
  siteUrl: "https://cliqo.example",
  orderAccessToken: "v1.1893456000." + "A".repeat(43),
};

test("Arabic order email includes secure tracking link and escapes customer content", () => {
  const email = buildOrderEmail({...shared, locale: "ar"});
  assert.match(email.subject, /CQ-100042/);
  assert.match(email.text, /تم استلام الطلب|طلبك وصلنا/);
  assert.match(email.html, /dir="rtl"/);
  assert.match(email.html, /\/orders\/CQ-100042\/access\?token=v1\.1893456000\./);
  assert.match(email.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(email.html, /<img src=x/);
  assert.match(email.html, /لا تشاركه مع غيرك/);
});

test("English order update email preserves status, currency, and tracking URL", () => {
  const email = buildOrderEmail({...shared, locale: "en", eventType: "order_update", state: "shipped"});
  assert.match(email.subject, /An update to your order/);
  assert.match(email.text, /Shipped/);
  assert.match(email.html, /dir="ltr"/);
  assert.match(email.html, /155\.00/);
  assert.match(email.html, /https:\/\/cliqo\.example\/orders\/CQ-100042\/access\?token=/);
});
