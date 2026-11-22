export type EmailLocale = "ar" | "en";
export type OrderEmailLine = { product_name_snapshot: string; quantity: number; line_total_minor: number };
export type OrderEmailData = {
  locale: EmailLocale;
  eventType: "order_received" | "order_update";
  reference: string;
  customerName: string;
  state: string;
  paymentState: string;
  paymentMethod: string;
  subtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  lines: OrderEmailLine[];
  siteUrl: string;
  orderAccessToken: string;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

export type BrandedMailboxEmailData = { subject: string; text: string; siteUrl: string };

export function buildBrandedMailboxEmail(data: BrandedMailboxEmailData) {
  const subject = data.subject.trim();
  const message = data.text.trim();
  const arabic = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u.test(`${subject}\n${message}`);
  const locale = arabic ? "ar" : "en";
  const direction = arabic ? "rtl" : "ltr";
  const textAlign = arabic ? "right" : "left";
  let siteUrl = "https://cliqoeg.com";
  try {
    const parsedSiteUrl = new URL(data.siteUrl);
    if (parsedSiteUrl.protocol === "https:") siteUrl = parsedSiteUrl.origin;
  } catch {
    // Keep the canonical production origin when a local preview has no public URL.
  }
  const logoUrl = new URL("/brand/2026-11-identity/wordmark-white.png", siteUrl).toString();
  const preheader = escapeHtml(message.replace(/\s+/g, " ").slice(0, 150) || subject);
  const paragraphs = message
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.85;color:#1e1e1e;white-space:pre-wrap">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const text = `${message}\n\n—\nCliQo\nOne Click .. You’re There\n${siteUrl}`;
  const html = `<!doctype html>
<html lang="${locale}" dir="${direction}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)} | CliQo</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f6;font-family:Arial,Tahoma,sans-serif;color:#1e1e1e">
  <div lang="${locale}" dir="${direction}" style="background-color:#f5f5f6;padding:28px 12px">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border:1px solid #d1d2d5;border-radius:14px;background-color:#ffffff;overflow:hidden">
        <tr><td bgcolor="#000000" style="padding:20px 26px;background-color:#000000;text-align:${textAlign}">
          <img src="${logoUrl}" width="132" height="52" alt="CliQo" style="display:block;width:132px;height:52px;border:0;outline:none;text-decoration:none">
        </td></tr>
        <tr><td bgcolor="#fb6221" height="4" style="height:4px;background-color:#fb6221;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:28px 30px 20px;text-align:${textAlign}">
          <h1 style="margin:0 0 22px;color:#000000;font-size:21px;line-height:1.45;font-weight:700">${escapeHtml(subject)}</h1>
          <div style="font-size:15px;line-height:1.85;color:#1e1e1e">${paragraphs}</div>
        </td></tr>
        <tr><td style="padding:0 30px"><div style="height:1px;background-color:#d1d2d5;font-size:0;line-height:0">&nbsp;</div></td></tr>
        <tr><td style="padding:16px 30px 22px;text-align:${textAlign}">
          <p style="margin:0 0 5px;color:#000000;font-size:13px;font-weight:700">CliQo</p>
          <p style="margin:0;color:#606064;font-size:11px;line-height:1.7">One Click .. You’re There · <a href="${siteUrl}" style="color:#1e1e1e;text-decoration:underline">cliqoeg.com</a></p>
        </td></tr>
      </table>
    </td></tr></table>
  </div>
</body>
</html>`;
  return { text, html };
}

const orderStates: Record<EmailLocale, Record<string, string>> = {
  ar: {
    new: "جديد", confirmed: "مؤكد", awaiting_design: "بانتظار التصميم",
    in_production: "قيد الإنتاج", quality_check: "فحص الجودة",
    ready_to_ship: "جاهز للشحن", shipped: "تم الشحن", delivered: "تم التسليم",
    cancelled: "ملغي", returned: "مرتجع",
  },
  en: {
    new: "New", confirmed: "Confirmed", awaiting_design: "Awaiting design",
    in_production: "In production", quality_check: "Quality check",
    ready_to_ship: "Ready to ship", shipped: "Shipped", delivered: "Delivered",
    cancelled: "Cancelled", returned: "Returned",
  },
};

function money(minor: number, locale: EmailLocale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
    style: "currency", currency: "EGP", maximumFractionDigits: 2,
  }).format(minor / 100);
}

export function buildOrderEmail(data: OrderEmailData) {
  const ar = data.locale === "ar";
  const direction = ar ? "rtl" : "ltr";
  const reference = escapeHtml(data.reference);
  const customerName = escapeHtml(data.customerName);
  const status = escapeHtml(orderStates[data.locale][data.state] ?? data.state);
  const payment = ar
    ? data.paymentMethod === "cod"
      ? data.paymentState === "cod_settled" ? "تم تحصيل الدفع عند الاستلام وتسويته."
        : data.paymentState === "cod_collected" ? "تم تحصيل المبلغ عند الاستلام، ولم تتم التسوية بعد."
          : "الدفع عند الاستلام؛ لم يُحصّل المبلغ بعد."
      : data.paymentState === "paid" ? "تم تأكيد دفع الطلب."
        : data.paymentState === "refunded" ? "تم رد المبلغ."
          : "حالة الدفع: " + data.paymentState
    : data.paymentMethod === "cod"
      ? data.paymentState === "cod_settled" ? "Cash on delivery was collected and settled."
        : data.paymentState === "cod_collected" ? "Cash on delivery was collected; settlement is pending."
          : "Cash on delivery; the amount has not been collected yet."
      : data.paymentState === "paid" ? "Your payment is confirmed."
        : data.paymentState === "refunded" ? "Your payment was refunded."
          : "Payment status: " + data.paymentState;
  const items = data.lines.map((line) => {
    const name = escapeHtml(line.product_name_snapshot);
    const quantity = Math.max(1, Math.trunc(line.quantity));
    return "<tr><td style=\"padding:12px 0;border-bottom:1px solid #e6e8eb\">" + name + " × " + quantity +
      "</td><td dir=\"ltr\" style=\"padding:12px 0;border-bottom:1px solid #e6e8eb;text-align:end\">" +
      money(line.line_total_minor, data.locale) + "</td></tr>";
  }).join("");
  const base = data.siteUrl.replace(/\/+$/, "");
  const logoUrl = escapeHtml(base + "/brand/2026-11-identity/wordmark-black.png");
  const orderUrl = base + "/orders/" + encodeURIComponent(data.reference) + "/access?token=" + encodeURIComponent(data.orderAccessToken);
  const contactUrl = base + "/contact";
  const title = ar
    ? data.eventType === "order_received" ? "استلمنا طلبك" : "تحديث على طلبك"
    : data.eventType === "order_received" ? "We received your order" : "An update to your order";
  const subject = title + " " + data.reference + " | CliQo";
  const intro = ar
    ? data.eventType === "order_received" ? "طلبك وصلنا، وهنراجعه قبل التجهيز." : "حالة طلبك اتحدثت."
    : data.eventType === "order_received" ? "Your order has arrived and will be reviewed before preparation." : "Your order status has changed.";
  const orderLinkNote = ar
    ? "رابط آمن لمتابعة الطلب؛ لا تشاركه مع غيرك."
    : "This secure order link grants access to your order. Do not share it.";
  const summaryRows = ar
    ? [["المنتجات", money(data.subtotalMinor, data.locale)], ["الشحن", money(data.shippingMinor, data.locale)], ["الإجمالي", money(data.totalMinor, data.locale)]]
    : [["Products", money(data.subtotalMinor, data.locale)], ["Shipping", money(data.shippingMinor, data.locale)], ["Total", money(data.totalMinor, data.locale)]];
  const summaryHtml = summaryRows.map((row, index) =>
    "<tr><td style=\"padding:6px 0;" + (index === 2 ? "font-weight:700;color:#000000" : "") + "\">" +
    escapeHtml(row[0]) + "</td><td dir=\"ltr\" style=\"padding:6px 0;text-align:end;" +
    (index === 2 ? "font-weight:700;color:#000000" : "") + "\">" + escapeHtml(row[1]) + "</td></tr>"
  ).join("");
  const plainItems = data.lines.map((line) =>
    "• " + line.product_name_snapshot + " × " + line.quantity + " — " + money(line.line_total_minor, data.locale)
  ).join("\n");
  const plainSummary = summaryRows.map((row) => row[0] + ": " + row[1]).join("\n");
  const text = ar
    ? "أهلًا " + data.customerName + "،\n" + intro + "\nرقم الطلب: " + data.reference + "\nالحالة: " +
      (orderStates.ar[data.state] ?? data.state) + "\n" + payment + "\n\n" + plainItems + "\n\n" +
      plainSummary + "\n\n" + orderLinkNote + "\n" + orderUrl + "\nللمساعدة: " + contactUrl +
      "\nCliQo | One Click .. You’re There"
    : "Hi " + data.customerName + ",\n" + intro + "\nOrder: " + data.reference + "\nStatus: " +
      (orderStates.en[data.state] ?? data.state) + "\n" + payment + "\n\n" + plainItems + "\n\n" +
      plainSummary + "\n\n" + orderLinkNote + "\n" + orderUrl + "\nHelp: " + contactUrl +
      "\nCliQo | One Click .. You’re There";

  const html = "<!doctype html><html lang=\"" + data.locale + "\" dir=\"" + direction +
    "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<title>" + escapeHtml(title) + "</title></head><body style=\"margin:0;background:#ffffff;color:#1e1e1e;" +
    "font-family:Arial,Tahoma,sans-serif\"><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\"" +
    " style=\"background:#ffffff;padding:28px 12px\"><tr><td align=\"center\"><table role=\"presentation\" width=\"100%\"" +
    " cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:600px;background:#fff;border:1px solid #e6e8eb;border-radius:18px;padding:28px\">" +
    "<tr><td><img src=\"" + logoUrl + "\" alt=\"CliQo\" width=\"150\" height=\"59\" style=\"display:block;width:150px;height:59px;object-fit:contain;margin:0 0 20px\">" +
    "<h1 style=\"font-size:24px;line-height:1.5;margin:0 0 10px;color:#000000\">" + escapeHtml(title) + "</h1>" +
    "<p style=\"line-height:1.8;margin:0 0 18px\">" + (ar ? "أهلًا " + customerName + "، " : "Hi " + customerName + " ") +
    escapeHtml(intro) + "</p><div style=\"padding:14px 16px;background:#f5f5f6;border-radius:12px;margin-bottom:18px\">" +
    "<strong>" + (ar ? "رقم الطلب" : "Order") + ": <bdi dir=\"ltr\">" + reference + "</bdi></strong><p style=\"margin:8px 0 0\">" +
    (ar ? "الحالة" : "Status") + ": " + status + "</p></div><p style=\"line-height:1.8\">" + escapeHtml(payment) +
    "</p><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"border-collapse:collapse;margin:18px 0\">" +
    items + "<tr><td colspan=\"2\" style=\"padding-top:14px\"><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\">" +
    summaryHtml + "</table></td></tr></table><a href=\"" + escapeHtml(orderUrl) +
    "\" style=\"display:inline-block;background:#000000;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700\">" +
    (ar ? "متابعة الطلب" : "View order") + "</a><p style=\"font-size:13px;line-height:1.8;color:#606064;margin:12px 0 20px\">" +
    escapeHtml(orderLinkNote) + "</p><p style=\"font-size:13px;line-height:1.8;color:#606064\">" +
    (ar ? "للمساعدة " : "Need help? ") + "<a href=\"" + escapeHtml(contactUrl) + "\" style=\"color:#000000\">" +
    (ar ? "تواصل مع CliQo" : "Contact CliQo") + "</a></p><hr style=\"border:0;border-top:1px solid #e6e8eb;margin:22px 0\">" +
    "<p style=\"font-size:12px;color:#606064;margin:0\">One Click .. You’re There</p></td></tr></table></td></tr></table></body></html>";

  return { subject, text, html };
}
