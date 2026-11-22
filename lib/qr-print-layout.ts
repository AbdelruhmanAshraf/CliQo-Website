import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import templates from "./qr-print-templates.json";
import { createSmartItemQrSvg, type QrStyle } from "./smart-item-qr";

export type PrintTemplate = {
  file: string;
  frontFile?: string;
  widthMm?: number;
  heightMm?: number;
  retired?: boolean;
  qr: { x: number; y: number; size: number; style?: QrStyle; largerIcon?: boolean; clear?: { x: number; y: number; width: number; height: number; fill: string } };
  id?: {
    x: number; y: number; fontSize: number; fill: string; anchor?: "start" | "middle" | "end";
    box?: { x: number; y: number; width: number; height: number; fill: string };
  };
};
export type LoadedPrintTemplate = PrintTemplate & { width: number; height: number; mime: string; base64: string };
export type LoadedPrintArtwork = { file: string; widthMm: number; heightMm: number; width: number; height: number; mime: string; base64: string };

export function getPrintTemplate(family: string, face: string, variant: string, design: string): PrintTemplate | null {
  const key = `${family}/${face}/${variant}/${design}`;
  return (templates as Record<string, PrintTemplate>)[key] ?? null;
}

export async function loadPrintTemplate(template: PrintTemplate): Promise<LoadedPrintTemplate> {
  if (!template.file.startsWith("/print-templates/") || template.file.includes("..")) throw new Error("مسار قالب الطباعة غير صالح.");
  const file = path.join(process.cwd(), "public", template.file);
  const bytes = await readFile(file);
  const metadata = await sharp(bytes).metadata();
  const mime = ({ png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as Record<string, string>)[metadata.format ?? ""];
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const { x, y, size } = template.qr;
  const clear = template.qr.clear;
  const id = template.id;
  const idBox = id?.box;
  if (!mime || !width || !height || ![x, y, size].every(Number.isFinite)
    || x < 0 || y < 0 || size <= 0 || x + size > width || y + size > height
    || (clear && (![clear.x, clear.y, clear.width, clear.height].every(Number.isFinite)
      || clear.x < 0 || clear.y < 0 || clear.width <= 0 || clear.height <= 0
      || clear.x + clear.width > width || clear.y + clear.height > height))
    || (id && (![id.x, id.y, id.fontSize].every(Number.isFinite)
      || id.x < 0 || id.x > width || id.y < 0 || id.y > height || id.fontSize <= 0))
    || (idBox && (![idBox.x, idBox.y, idBox.width, idBox.height].every(Number.isFinite)
      || idBox.x < 0 || idBox.y < 0 || idBox.width <= 0 || idBox.height <= 0
      || idBox.x + idBox.width > width || idBox.y + idBox.height > height))
    || (template.widthMm !== undefined && (!Number.isFinite(template.widthMm) || template.widthMm <= 0))
    || (template.heightMm !== undefined && (!Number.isFinite(template.heightMm) || template.heightMm <= 0))) {
    throw new Error("مقاس أو موضع QR في قالب الطباعة غير صالح.");
  }
  return { ...template, width, height, mime, base64: bytes.toString("base64") };
}

export async function loadPrintArtwork(file: string, widthMm: number, heightMm: number): Promise<LoadedPrintArtwork> {
  if (!file.startsWith("/print-templates/") || file.includes("..")) throw new Error("مسار قالب الطباعة غير صالح.");
  if (![widthMm, heightMm].every((value) => Number.isFinite(value) && value > 0)) throw new Error("مقاس قالب الطباعة غير صالح.");
  const bytes = await readFile(path.join(process.cwd(), "public", file));
  const metadata = await sharp(bytes).metadata();
  const mime = ({ png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as Record<string, string>)[metadata.format ?? ""];
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!mime || !width || !height || Math.abs(width / height - widthMm / heightMm) > 0.03) {
    throw new Error("ملف قالب الطباعة لا يطابق مقاس الوجه المطلوب.");
  }
  return { file, widthMm, heightMm, width, height, mime, base64: bytes.toString("base64") };
}

export function createPrintArtworkSvg(artwork: LoadedPrintArtwork) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${artwork.widthMm}mm" height="${artwork.heightMm}mm" viewBox="0 0 ${artwork.width} ${artwork.height}"><image x="0" y="0" width="${artwork.width}" height="${artwork.height}" href="data:${artwork.mime};base64,${artwork.base64}"/></svg>`;
}

export async function createSmartItemPrintSvg(publicId: string, origin: string, face: string, template: LoadedPrintTemplate, previewQr?: string, identifier?: string) {
  const qr = previewQr ?? await createSmartItemQrSvg(publicId, origin, face, template.qr.style, template.qr.largerIcon);
  const { x, y, size } = template.qr;
  const placedQr = qr.replace(/^<svg([^>]*)>/, (_root, attributes: string) => {
    const rootAttributes = attributes.replace(/\s+(?:x|y|width|height)="[^"]*"/g, "");
    return `<svg${rootAttributes} x="${x}" y="${y}" width="${size}" height="${size}">`;
  });
  const idBox = identifier && template.id?.box
    ? `<rect x="${template.id.box.x}" y="${template.id.box.y}" width="${template.id.box.width}" height="${template.id.box.height}" fill="${template.id.box.fill}"/>`
    : "";
  const qrClear = template.qr.clear
    ? `<rect x="${template.qr.clear.x}" y="${template.qr.clear.y}" width="${template.qr.clear.width}" height="${template.qr.clear.height}" fill="${template.qr.clear.fill}"/>`
    : "";
  const printedId = identifier && template.id
    ? `${idBox}<text x="${template.id.x}" y="${template.id.y}" text-anchor="${template.id.anchor ?? "middle"}" fill="${template.id.fill}" font-family="Arial,sans-serif" font-size="${template.id.fontSize}" font-weight="600" letter-spacing="1.2">${identifier.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</text>`
    : "";
  const width = template.widthMm ? `${template.widthMm}mm` : template.width;
  const height = template.heightMm ? `${template.heightMm}mm` : template.height;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${template.width} ${template.height}"><image x="0" y="0" width="${template.width}" height="${template.height}" href="data:${template.mime};base64,${template.base64}"/>${qrClear}${placedQr}${printedId}</svg>`;
}

export async function createSmartItemPrintPng(svg: string, template: Pick<LoadedPrintArtwork, "width" | "height"> & { widthMm?: number; heightMm?: number }) {
  // Render in pixel units to avoid libvips applying density twice to mm dimensions.
  // Source artwork retains its original detail; the QR is rasterized from vectors.
  const density = 300;
  const width = template.widthMm ? Math.round(template.widthMm / 25.4 * density) : template.width * 4;
  const height = template.heightMm ? Math.round(template.heightMm / 25.4 * density) : Math.round(width * template.height / template.width);
  const rasterSvg = svg.replace(/^<svg[^>]*>/, (root) => root
    .replace(/width="[^"]*"/, `width="${width}"`).replace(/height="[^"]*"/, `height="${height}"`));
  return sharp(Buffer.from(rasterSvg), { density: 72 }).withMetadata({ density }).png().toBuffer();
}

export function createSmartItemBackSvg(activationCode: string, template: LoadedPrintTemplate) {
  const width = template.widthMm ?? template.width;
  const height = template.heightMm ?? template.height;
  const isShortCode = /^\d{6}$/.test(activationCode);
  if (!isShortCode && !/^[A-F0-9]{12}$/.test(activationCode)) throw new Error("رقم الحفر غير صالح.");
  const size = isShortCode ? 6 : 4;
  const spacing = isShortCode ? 1 : 0.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#FFFFFF"/><text x="50%" y="83%" text-anchor="middle" fill="#000000" font-family="Arial,sans-serif" font-size="${size}" font-weight="700" letter-spacing="${spacing}">${activationCode}</text></svg>`;
}
