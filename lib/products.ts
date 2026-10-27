export type Product = {
  slug: string;
  name: string;
  shortName: string;
  category: string;
  statusLabel: string;
  status: "preparing" | "ready";
  visual: string;
  description: string;
  supportsLandingPage: boolean;
  priceEgp: number | null;
};

export const products: Product[] = [
  { slug: "stand", name: "ستاند NFC", shortName: "STAND", category: "للكاونتر", statusLabel: "قيد التجهيز", status: "preparing", visual: "visual-stand", description: "ستاند أكريليك رأسي 100 × 150 مم، بأوجه مختلفة للتقييم أو الدفع أو السوشيال أو صفحة روابطك.", supportsLandingPage: true, priceEgp: null },
  { slug: "coaster", name: "كوستر ذكي", shortName: "COASTER", category: "للطاولة", statusLabel: "قريبًا", status: "preparing", visual: "visual-pad", description: "كوستر NFC وQR يسهّل على ضيوفك الوصول لصفحتك أو وجهتك الرقمية.", supportsLandingPage: true, priceEgp: null },
  { slug: "card", name: "كارت PVC ذكي", shortName: "SMART CARD", category: "للتواصل", statusLabel: "قريبًا", status: "preparing", visual: "visual-card", description: "كارت ذكي يفتح بياناتك وروابط التواصل بلمسة واحدة.", supportsLandingPage: true, priceEgp: null },
  { slug: "wallet", name: "محفظة ذكية", shortName: "WALLET", category: "للاستخدام اليومي", statusLabel: "قريبًا", status: "preparing", visual: "visual-wallet", description: "محفظة يومية مع نقطة NFC للوصول السريع لوجهتك الرقمية.", supportsLandingPage: false, priceEgp: null },
  { slug: "magnetic-wallet", name: "محفظة مغناطيسية", shortName: "MAG WALLET", category: "للهاتف", statusLabel: "قريبًا", status: "preparing", visual: "visual-magnetic", description: "محفظة مغناطيسية للهاتف مع تجربة NFC سهلة الوصول.", supportsLandingPage: false, priceEgp: null },
  { slug: "keychain", name: "ميدالية NFC", shortName: "KEYCHAIN", category: "معاك دايمًا", statusLabel: "قريبًا", status: "preparing", visual: "visual-keychain", description: "ميدالية صغيرة تفتح رابطك بسرعة عبر NFC أو QR.", supportsLandingPage: false, priceEgp: null },
];

export function getProduct(slug: string) {
  return products.find((product) => product.slug === slug);
}
