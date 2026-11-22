import { FiGlobe, FiLink, FiLinkedin, FiMail, FiPhone, FiShare2, FiUserPlus } from "react-icons/fi";
import { SiFacebook, SiInstagram, SiTiktok, SiVodafone, SiWhatsapp, SiYoutube } from "react-icons/si";

export type ServiceIconKey =
  | "link" | "website" | "instagram" | "facebook" | "tiktok"
  | "whatsapp" | "youtube" | "linkedin" | "phone" | "email"
  | "save-contact" | "share" | "vodafone" | "instapay";

export function ServiceIcon({ name, size = 18 }: { name: ServiceIconKey | string; size?: number }) {
  const props = { size, "aria-hidden": true as const, focusable: false as const };
  switch (name) {
    case "instagram": return <SiInstagram {...props} />;
    case "facebook": return <SiFacebook {...props} />;
    case "tiktok": return <SiTiktok {...props} />;
    case "whatsapp": return <SiWhatsapp {...props} />;
    case "youtube": return <SiYoutube {...props} />;
    case "linkedin": return <FiLinkedin {...props} />;
    case "vodafone": return <SiVodafone {...props} />;
    case "instapay": return <span aria-hidden="true" className="service-icon-letter">IP</span>;
    case "website": return <FiGlobe {...props} />;
    case "phone": return <FiPhone {...props} />;
    case "email": return <FiMail {...props} />;
    case "save-contact": return <FiUserPlus {...props} />;
    case "share": return <FiShare2 {...props} />;
    default: return <FiLink {...props} />;
  }
}
