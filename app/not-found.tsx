import { getCopy } from '@/i18n/server';
import {LanguageSwitcher} from "./language-switcher";
import Link from "next/link";
import { CliqoLogo } from "./cliqo-logo";
export default async function NotFound() {
  const tr = await getCopy();

  return <main className="unavailable" ><LanguageSwitcher/><Link className="brand" href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={138} /></Link><h1>{tr("الرابط مش متاح.")}</h1><p>{tr("ممكن الستاند مش مفعّل أو الرابط غير صحيح.")}</p><Link href="/">{tr("الرجوع للموقع")}</Link></main>;
}
