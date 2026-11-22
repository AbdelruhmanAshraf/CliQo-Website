export const standMockup = (design: string) => `/products/mockups/stands/${design}.webp`;
export const standPreview = (design: string) => `/products/demo/stands/${design}.webp`;
export const coasterMockup = (design: string) => `/products/mockups/coasters/${design}.webp`;
export const coasterPreview = (design: string) => `/products/demo/coasters/${design}.webp`;
export const cardMockup = (design: string) => `/products/mockups/cards/${design}.webp`;
export const cardSide = (design: string, side: "front" | "back") => `/products/demo/cards/${design}-${side}.webp`;

export function isOldPrintProductImage(family: string, src: string) {
  if (family !== "stand" && family !== "coaster" && family !== "card") return false;
  if (family === "card" && src.startsWith("/print-templates/card-art/")) return true;
  const file = src.match(/^\/(?:products\/(?:mockups\/(?:zip-source\/)?|artwork\/|demo\/)|print-templates\/)([^/]+)$/)?.[1];
  return file?.startsWith(`${family}-`) || src === `/stitch/${family}.webp` || src === `/stitch/${family}-lifestyle.webp`;
}

export const productPhotos: Record<string, string> = {
  stand: standMockup("all-in-one"),
  coaster: coasterMockup("all-in-one"),
  card: cardMockup("main-black"),
  wallet: "/campaigns/product-cutouts/wallet.png",
  "magnetic-wallet": "/campaigns/product-cutouts/magnetic-wallet.png",
  keychain: "/campaigns/product-cutouts/keychain.png",
};
