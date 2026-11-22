import "server-only";
import QRCode from "qrcode";
import brandIcons from "./qr-brand-icons.json";
import instaPayIcon from "./qr-instapay-icon.json";

export type QrStyle = "card-dark" | "card-light" | "square";

export async function buildSmartItemQr(publicId: string, face: string, inline = false, style?: QrStyle) {
  const target = getSmartItemQrTarget();
  if (!target) {
    return new Response("اضبط NEXT_PUBLIC_SITE_URL على نطاق الموقع أو عنوان التجربة المحلية لتنزيل QR.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const svg = await createSmartItemQrSvg(publicId, target.origin, face, style);
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${target.preview ? "TEST-" : ""}CLIQO-QR-${publicId}.svg"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function getSmartItemQrTarget(): { origin: string; preview: boolean } | null {
  try {
    const configured = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
    if (configured.pathname !== "/" || configured.search || configured.hash
      || configured.username || configured.password) return null;
    if (configured.origin === "https://cliqoeg.com") return { origin: configured.origin, preview: false };
  } catch { /* Invalid origin. */ }
  try {
    const preview = new URL(process.env.CLIQO_QR_PREVIEW_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL || "");
    const host = preview.hostname;
    const localNetwork = host === "localhost" || host === "127.0.0.1"
      || host.startsWith("192.168.") || host.startsWith("10.")
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (localNetwork && ["http:", "https:"].includes(preview.protocol)
      && preview.pathname === "/" && !preview.search && !preview.hash
      && !preview.username && !preview.password) {
      return { origin: preview.origin, preview: true };
    }
  } catch { /* Invalid preview origin. */ }
  return null;
}

function iconMarkup(face: string, x: number, y: number, size: number) {
  const icons = {
    review: { icon: brandIcons.review, background: "#FFFFFF", scale: 0.72 },
    facebook: { icon: brandIcons.facebook, background: "#0866FF", scale: 0.54 },
    instagram: { icon: brandIcons.instagram, background: "url(#instagram-gradient)", scale: 0.55 },
    tiktok: { icon: brandIcons.tiktok, background: "#111111", scale: 0.55 },
    vodafone: { icon: brandIcons.vodafone, background: "#E60000", scale: 0.56 },
  } as const;
  if (face === "all-in-one") return "";
  const badge = `<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size / 2}" fill="#FFFFFF"/>`;
  if (face === "instapay") {
    const inset=size*0.06;
    return `${badge}<image x="${x+inset}" y="${y+inset}" width="${size-inset*2}" height="${size-inset*2}" href="data:image/png;base64,${instaPayIcon.data}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  const selected = icons[face as keyof typeof icons];
  if (!selected) return "";
  const iconSize = size * selected.scale;
  const rendered = selected.icon
    .replace(' x="0px" y="0px"', '')
    .replace("<svg ", `<svg x="${x + (size - iconSize) / 2}" y="${y + (size - iconSize) / 2}" `)
    .replace('height="1em"', `height="${iconSize}"`)
    .replace('width="1em"', `width="${iconSize}"`)
    .replaceAll("currentColor", "#FFFFFF");
  return `${badge}<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size * 0.44}" fill="${selected.background}"/>${rendered}`;
}

export async function createSmartItemQrSvg(publicId: string, origin: string, face = "all-in-one", style?: QrStyle, largerIcon = false) {
  const url = new URL(`/s/${publicId}`, origin).toString();
  return createStyledQrSvg(url, face, false, style, largerIcon);
}

export function createPreviewQrSvg(face = "all-in-one", style?: QrStyle) {
  return createStyledQrSvg("CLIQO PREVIEW - NO ACTIVE LINK", face, true, style);
}

function createStyledQrSvg(payload: string, face: string, decorative = false, style?: QrStyle, largerIcon = false) {
  const square = style === "square";
  const qr = QRCode.create(payload, { errorCorrectionLevel: square || face === "all-in-one" ? "Q" : "H" });
  const count = qr.modules.size;
  const displayModule = (row: number, col: number) => {
    const moduleOn = Boolean(qr.modules.get(row, col));
    return decorative ? moduleOn !== ((row * 101 + col * 167 + row * col * 13) % 7 < 3) : moduleOn;
  };
  if (square) {
    const quiet = 4;
    const size = count + quiet * 2;
    const modules: string[] = [];
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) {
      const inFinder = (row < 8 && col < 8) || (row < 8 && col >= count - 8) || (row >= count - 8 && col < 8);
      if (inFinder ? qr.modules.get(row, col) : displayModule(row, col)) {
        modules.push(`M${col + quiet},${row + quiet}h1v1h-1z`);
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="QR" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#FFFFFF"/><path d="${modules.join("")}" fill="#000000"/></svg>`;
  }
  const foreground = style === "card-dark" ? "#FFFFFF" : "#000000";
  const background = style === "card-dark" ? "#0B0B0B" : style === "card-light" ? "#F8F8F8" : "#FFFFFF";
  const center = style === "card-dark" ? "#FF8500" : style === "card-light" ? "#A63E00" : foreground;
  const quiet = decorative && !style ? 0 : 4;
  const unit = 1000 / (count + quiet * 2);
  const finder = (row: number, col: number) =>
    (row < 7 && col < 7) || (row < 7 && col >= count - 7) || (row >= count - 7 && col < 7);
  const dots: string[] = [];
  for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) {
    if (!displayModule(row, col) || finder(row, col)) continue;
    dots.push(style
      ? `<rect x="${((col + quiet) * unit).toFixed(3)}" y="${((row + quiet) * unit).toFixed(3)}" width="${(unit + 0.02).toFixed(3)}" height="${(unit + 0.02).toFixed(3)}"/>`
      : `<circle cx="${((col + quiet + 0.5) * unit).toFixed(3)}" cy="${((row + quiet + 0.5) * unit).toFixed(3)}" r="${(unit * 0.49).toFixed(3)}"/>`);
  }
  const corner = (row: number, col: number) => {
    const x = (col + quiet) * unit;
    const y = (row + quiet) * unit;
    return `<rect x="${x}" y="${y}" width="${7 * unit}" height="${7 * unit}" rx="${1.4 * unit}" fill="${foreground}"/><rect x="${x + unit}" y="${y + unit}" width="${5 * unit}" height="${5 * unit}" rx="${0.95 * unit}" fill="${background}"/><rect x="${x + 2 * unit}" y="${y + 2 * unit}" width="${3 * unit}" height="${3 * unit}" rx="${0.55 * unit}" fill="${center}"/>`;
  };
  const badgeSize = unit * Math.min(decorative ? 12 : largerIcon ? 9 : 7, count * (decorative ? 0.26 : largerIcon ? 0.19 : 0.14));
  const badge = iconMarkup(face, (1000 - badgeSize) / 2, (1000 - badgeSize) / 2, badgeSize);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" role="img" aria-label="QR"><defs><linearGradient id="instagram-gradient" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset="0.45" stop-color="#D62976"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs><rect width="1000" height="1000" fill="${background}"/><g fill="${foreground}">${dots.join("")}</g>${corner(0, 0)}${corner(0, count - 7)}${corner(count - 7, 0)}${badge}</svg>`;
}

export function getSmartItemPrintOrigin() {
  try {
    const configured = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
    if (configured.origin === "https://cliqoeg.com" && configured.pathname === "/"
      && !configured.search && !configured.hash && !configured.username && !configured.password) {
      return configured.origin;
    }
  } catch { /* A missing or invalid origin cannot produce print artwork. */ }
  return null;
}
