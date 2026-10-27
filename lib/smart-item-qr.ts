import "server-only";
import QRCode from "qrcode";

export async function buildSmartItemQr(publicId: string) {
  const origin = getPublicOrigin();
  const url = new URL(`/s/${publicId}`, origin).toString();
  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 4,
    width: 1000,
    color: { dark: "#003A31", light: "#FFFFFF" },
  });
  const productionReady = process.env.NODE_ENV === "production" && origin.startsWith("https://");
  const label = productionReady ? "CLIQO-QR" : "CLIQO-QR-LOCAL-TEST";

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${label}-${publicId}.svg"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function getPublicOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall back to an explicitly local test link; never infer a production host from request headers.
    }
  }
  return "http://localhost:4173";
}
