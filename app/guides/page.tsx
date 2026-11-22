import { getCopy } from '@/i18n/server';
import {LanguageSwitcher} from "@/app/language-switcher";
import Link from "next/link";
import { CliqoLogo } from "@/app/cliqo-logo";
import { PrintGuideButton } from "./print-button";
import styles from "./guide.module.css";

export default async function CustomerGuidesPage() {
  const tr = await getCopy();

  return <main className={styles.guide} >
    <header className={styles.header}><Link className="brand" href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={132} /></Link><nav><Link href="/how-it-works">{tr("طريقة العمل")}</Link><Link href="/faq">{tr("الأسئلة الشائعة")}</Link><Link href="/dashboard">{tr("لوحة العميل")}</Link></nav><PrintGuideButton /><LanguageSwitcher/></header>
    <section className={styles.hero}><p className={styles.kicker}>{tr("دليل إعداد القطعة الذكية")}</p><h1>{tr("QR واحد ثابت.")}<br /><em>{tr("وتجربتك تتغير وقت ما تحب.")}</em></h1><p>{tr("فعّل قطعتك، جهّز الصفحة، واكتب رابط CliQo على شريحة NFC. بعد الإعداد، غيّر الوجهة من الداشبورد من غير ما تعيد طباعة QR أو برمجة الشريحة.")}</p></section>
    <section className={styles.paths}>
    <article><span>{tr("01 · Template جاهز")}</span><h2>{tr("إعدادك بنفسك")}</h2><ol><li>{tr("سجّل الدخول وافتح")} <Link href="/activate">{tr("تفعيل القطعة")}</Link>.</li><li>{tr("اكتب كود التفعيل المرفق داخل العبوة. مسح QR وحده لا يربط القطعة بحسابك.")}</li><li>{tr("من لوحة القطعة، اختار رابطًا واحدًا أو صفحة هبوط، ثم احفظ.")}</li><li>{tr("انسخ رابط CliQo الثابت الظاهر في إعدادات القطعة، واكتبه على NFC.")}</li></ol></article>
      <article><span>02 · Custom design</span><h2>{tr("CliQo تجهز NFC")}</h2><ol><li>{tr("أرسل رابط الوجهة وملف التصميم مع الطلب.")}</li><li>{tr("بعد اعتماد التصميم، CliQo تكتب رابط القطعة الثابت على NFC وتختبره.")}</li><li>{tr("فعّل القطعة بعد الاستلام لتعديل الوجهة أو الصفحة ومراجعة الإحصائيات.")}</li></ol></article>
    </section>
    <section className={styles.steps}><p className={styles.kicker}>{tr("خطوات كتابة NFC للـTemplate")}</p><h2>{tr("اكتب الرابط واختبره قبل الاستخدام")}</h2><div className={styles.stepGrid}>
      <article><b>1</b><h3>{tr("جهّز الرابط")}</h3><p>{tr("احفظ وجهتك أو انشر صفحة الهبوط من لوحة CliQo. انسخ الرابط الثابت كاملًا من إعدادات القطعة، وليس رابط Instagram أو موقعك.")}</p></article>
      <article><b>2</b><h3>{tr("افتح أداة كتابة NFC")}</h3><p>{tr("استخدم تطبيق كتابة NFC متوافقًا مع هاتفك والشريحة. اختار كتابة رابط أو URL، والصق رابط CliQo الكامل.")}</p></article>
      <article><b>3</b><h3>{tr("اكتب على الشريحة")}</h3><p>{tr("فعّل NFC في الهاتف إن احتاج. ثبّت الهاتف قرب الشريحة، واتبع تعليمات التطبيق حتى يؤكد نجاح الكتابة.")}</p></article>
      <article><b>4</b><h3>{tr("اختبر من جديد")}</h3><p>{tr("اقرأ الشريحة بهاتف آخر، وامسح QR بالكاميرا. تأكد أن الاثنين يفتحان نفس تجربة CliQo. لا تقفل الشريحة قبل نجاح الاختبار.")}</p></article>
    </div></section>
    <section className={styles.notes}><h2>{tr("مهم قبل ما تبدأ")}</h2><ul><li>{tr("كود التفعيل الخاص يكون داخل العبوة؛ لا تحفره على القطعة ولا تضفه لملفات المصنع أو QR أو NFC.")}</li><li>{tr("لو الرابط يبدأ بـ")} <code>localhost</code>  {tr("فهو للتجربة المحلية فقط، ولا يعمل على هاتف خارج جهاز التطوير. انتظر نطاق CliQo النهائي قبل كتابة قطعة للبيع.")}</li><li>{tr("بعد كتابة الرابط الثابت مرة، تعديل الوجهة أو صفحة الهبوط يتم من لوحة CliQo ولا يحتاج إعادة برمجة NFC.")}</li><li>{tr("القفل الدائم للشريحة قد يمنع تعديلها. لا تستخدمه قبل اختبار QR وNFC بالكامل.")}</li></ul></section>
    <footer><Link href="/dashboard">{tr("إدارة قطعك وصفحاتك ←")}</Link><span>CliQo · One Click .. You’re There</span></footer>
  </main>;
}
