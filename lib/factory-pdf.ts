import "server-only";
import sharp from "sharp";

export type FactoryPdfPage = { jpeg: Buffer; widthMm: number; heightMm: number; widthPx: number; heightPx: number };

function objectBytes(value: string | Buffer) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value, "binary");
}

export function createImagePdf(pages: FactoryPdfPage[]) {
  const objects: Buffer[] = [];
  const set = (number: number, body: string | Buffer) => { objects[number] = objectBytes(body); };
  set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const pageIds = pages.map((_, index) => 3 + index * 3);
  set(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const widthPt = page.widthMm * 72 / 25.4;
    const heightPt = page.heightMm * 72 / 25.4;
    const jpeg = page.jpeg;
    const content = Buffer.from(`q ${widthPt.toFixed(4)} 0 0 ${heightPt.toFixed(4)} 0 0 cm /Im0 Do Q`);
    set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt.toFixed(4)} ${heightPt.toFixed(4)}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    set(contentId, Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from("\nendstream")]));
    set(imageId, Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${page.widthPx} /Height ${page.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
      jpeg,
      Buffer.from("\nendstream"),
    ]));
  });
  const header = Buffer.from("%PDF-1.4\n%âãÏÓ\n", "binary");
  const chunks: Uint8Array[] = [header];
  const offsets = new Array<number>(objects.length).fill(0);
  let offset = header.length;
  for (let id = 1; id < objects.length; id++) {
    const body = objects[id];
    if (!body) throw new Error("كائن PDF ناقص.");
    const start = Buffer.from(`${id} 0 obj\n`, "ascii");
    const end = Buffer.from("\nendobj\n", "ascii");
    offsets[id] = offset;
    chunks.push(start, body, end);
    offset += start.length + body.length + end.length;
  }
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objects.length}\n`, "0000000000 65535 f \n"];
  for (let id = 1; id < offsets.length; id++) xref.push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  const trailer = `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(Buffer.from(xref.join("") + trailer, "ascii"));
  return Buffer.concat(chunks);
}

export async function makeActivationCardSvg(input: {
  activationCode: string; shortId: string; publicId: string; productName: string; skuCode: string; arabicFontBase64: string;
}) {
  const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="85.6mm" height="54mm" viewBox="0 0 856 540"><style>@font-face{font-family:CliqoArabic;src:url(data:font/otf;base64,${input.arabicFontBase64}) format('opentype')}text{font-family:CliqoArabic,Arial,sans-serif}</style><rect width="856" height="540" fill="#fff"/><rect x="14" y="14" width="828" height="512" rx="24" fill="none" stroke="#000000" stroke-width="5"/><text x="428" y="78" text-anchor="middle" fill="#000000" font-size="34" font-weight="700" direction="rtl">CliQo · بطاقة التفعيل</text><text x="428" y="128" text-anchor="middle" fill="#424B47" font-size="23" direction="rtl">اطبع البطاقة وضعها داخل عبوة المنتج</text><text x="428" y="258" text-anchor="middle" fill="#000000" font-family="Arial,sans-serif" font-size="100" font-weight="700" letter-spacing="14">${esc(input.activationCode)}</text><text x="428" y="317" text-anchor="middle" fill="#000000" font-size="22" direction="rtl">رقم القطعة: ${esc(input.shortId)}</text><text x="428" y="359" text-anchor="middle" fill="#46514C" font-family="Arial,sans-serif" font-size="18">${esc(input.publicId)}</text><text x="428" y="405" text-anchor="middle" fill="#46514C" font-size="21" direction="rtl">${esc(input.productName)} · ${esc(input.skuCode)}</text><text x="428" y="465" text-anchor="middle" fill="#59635E" font-size="17" direction="rtl">الكود للعميل فقط · لا يوضع على التصميم أو QR أو NFC</text></svg>`;
}

export async function jpegPage(png: Buffer, widthMm: number, heightMm: number): Promise<FactoryPdfPage> {
  const image = sharp(png).flatten({ background: "#ffffff" }).jpeg({ quality: 96, chromaSubsampling: "4:4:4" });
  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  return { jpeg: data, widthMm, heightMm, widthPx: info.width, heightPx: info.height };
}
