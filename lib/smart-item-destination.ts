const socialServices: Record<string, string[]> = {
  review: ["google.com", "g.page", "maps.app.goo.gl"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.me"],
  tiktok: ["tiktok.com"],
};

export function isPrintedLinkFace(face?: string): boolean {
  return Boolean(face && Object.hasOwn(socialServices, face));
}

export function matchesPrintedDestination(host: string, face?: string): boolean {
  if (!face || !Object.hasOwn(socialServices, face)) return false;
  return socialServices[face].some(domain =>
    host === domain || (["google.com", "instagram.com", "facebook.com", "tiktok.com"].includes(domain) && host.endsWith(`.${domain}`)),
  );
}
