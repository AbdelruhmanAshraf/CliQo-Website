import Image from 'next/image';
import Link from 'next/link';
import {getCopy} from '@/i18n/server';
import {SiteNav} from './site-nav';
import {MarketingFooter} from './marketing-footer';
import {ProductShowcaseCard} from './product-showcase-card';
import {HomeDemo} from './home-demo';
import {CampaignPosters} from './campaign-posters';
import {products} from '@/lib/products';
import {getSaleFamilyKeys} from '@/lib/sale-skus';

export const dynamic = 'force-dynamic';
const uses = [
  {icon: '★', tag: 'للمحلات والأنشطة', title: 'خلّي الوصول لتقييمك أسهل.', body: 'وجّه عميلك لرابط تقييم Google المعتمد لنشاطك، وهو يشارك رأيه بحرية.', product: 'ستاند التقييم', href: '/products/stand'},
  {icon: '@', tag: 'للبراند وصنّاع المحتوى', title: 'الزيارة تخلص، والتواصل يكمل.', body: 'شارك حساب السوشيال المناسب من غير بحث عن الاسم أو كتابة الرابط.', product: 'أوجه السوشيال', href: '/products/stand'},
  {icon: '↗', tag: 'للكاونتر ونقطة الخدمة', title: 'بيانات الدفع قدام عميلك.', body: 'اعرض وسيلة نشاطك المطبوعة، InstaPay أو Vodafone Cash، مع بيانات المستلم.', product: 'ستاند الدفع', href: '/products/stand'},
  {icon: '⌘', tag: 'للأفراد والبيزنس', title: 'عرّفهم بيك من أول لمسة.', body: 'اجمع بياناتك وروابطك في صفحة قابلة للتعديل على المنتجات والأوجه المدعومة.', product: 'منتجات صفحة الروابط', href: '/products'},
];
const faq = [
  ['إيه الفرق بين NFC وQR؟', 'NFC يفتح رابط القطعة بلمسة بهاتف متوافق. QR يتقري بكاميرا الهاتف. الاتنين بيفتحوا نفس رابط CliQo الثابت.'],
  ['هل كل الموبايلات بتدعم NFC؟', 'قراءة NFC تعتمد على موديل الهاتف وإعداداته. لو الهاتف لا يدعم القراءة، يقدر الزائر يستخدم QR بالكاميرا. برمجة القالب الجاهز تحتاج هاتفًا وتطبيقًا متوافقين.'],
  ['إزاي أفعّل القطعة؟', 'سجّل دخولك، امسح QR لتحديد القطعة، وأدخل كود التفعيل الخاص الموجود داخل العبوة لإثبات ملكيتك. مسح QR وحده لا يمنح ملكية القطعة.'],
  ['هل لازم أغيّر QR لما أعدّل الرابط؟', 'لأ. رابط CliQo وQR يفضلوا ثابتين. بتعدّل الوجهة أو الصفحة من حسابك ضمن وظيفة الوجه المطبوع على قطعتك.'],
  ['أختار قالب جاهز ولا تصميم مخصص؟', 'القالب الجاهز تفعّله وتضبط وجهته وتكتب رابطه على NFC بنفسك باتباع الدليل. التصميم المخصص تجهز CliQo وجهته الأولى وتبرمج NFC وتختبره قبل الشحن.'],
  ['الإحصائيات بتقيس إيه؟', 'إجمالي فتحات الرابط ونقرات الأزرار داخل صفحات CliQo. QR وNFC بيتحسبوا مع بعض، والفتحات مش عدد أشخاص فريدين. النقر لا يؤكد إتمام تقييم أو متابعة أو تحويل خارج CliQo.'],
];

export default async function Home() {
  const tr = await getCopy();
  const families = await getSaleFamilyKeys();
  const available = (slug: string) => families.has(slug === 'card' ? 'pvc-card' : slug);
  return <><SiteNav/><main id="top" className="cq-home">
    <section className="cq-hero cq-shell">
      <div className="cq-hero-copy"><p className="cq-eyebrow cq-eyebrow-light"><span className="cq-signal"/> {tr('من منتج في إيدك، لخطوة تفرق.')}</p>
        <h1>{tr('قرّب موبايلك.')}<br/><em>{tr('افتح اللي يهمك.')}</em></h1>
        <p className="cq-hero-description">{tr('منتجات NFC وQR توصّل الناس لتقييم نشاطك، حساباتك، بيانات الدفع أو صفحة روابطك. وأنت تتحكم في الوجهة من حسابك.')}</p>
        <div className="cq-actions"><Link href="/products" className="cq-button cq-button-primary">{tr('استكشف المنتجات')}<span className="cq-arrow">↗</span></Link><a href="#experience" className="cq-button cq-button-outline"><span aria-hidden="true">▷</span>{tr('شوف إزاي بتشتغل')}</a></div>
        <div className="cq-hero-tags"><span>NFC + QR</span><span>{tr('رابط ثابت، وجهة تتعدل')}</span><span>{tr('للأفراد والبيزنس')}</span></div>
      </div>
      <div className="cq-hero-visual"><div className="cq-hero-photo"><Image src="/stitch/hero.webp" alt={tr('تصور بصري لستاند CliQo في مقهى')} fill priority sizes="(max-width: 750px) 90vw, 47vw"/><small className="cq-image-label">{tr('تصور بصري')}</small></div>
        <div className="cq-hero-float"><span className="cq-touch-icon" aria-hidden="true">⌁</span><div><strong>{tr('منتج واحد. رابطك ثابت.')}</strong><span>{tr('حدّث الوجهة من غير تغيير الطباعة.')}</span></div><span className="cq-float-arrow" aria-hidden="true">↗</span></div>
        <span className="cq-hero-orbit" aria-hidden="true"/>
      </div>
      <div className="cq-hero-bottom"><span>One Click .. You’re There</span><a href="#benefits">{tr('اكتشف اللي يناسبك')}<span aria-hidden="true">↓</span></a></div>
    </section>

    <CampaignPosters/>

    <section className="cq-section cq-use-section" id="benefits"><div className="cq-section-heading"><div><p className="cq-eyebrow">{tr('الفايدة قبل التقنية')}</p><h2>{tr('خطوة أبسط ليك.')}<br/><span>{tr('وتجربة أسهل للي قدامك.')}</span></h2></div><p>{tr('سواء بتعرّف الناس بنفسك أو بتدير نشاط، اختار التجربة اللي محتاجها وسيب الباقي على لمسة أو مسح.')}</p></div>
      <div className="cq-use-grid">{uses.map((use, index) => <article key={use.title} className={`cq-use-card cq-use-${index}`}><span className="cq-use-icon" aria-hidden="true">{use.icon}</span><small>{tr(use.tag)}</small><h3>{tr(use.title)}</h3><p>{tr(use.body)}</p><Link href={use.href}>{tr(use.product)} <span className="cq-arrow" aria-hidden="true">↗</span></Link></article>)}</div>
    </section>

    <section className="cq-section cq-experience cq-shell" id="experience"><div className="cq-section-heading cq-heading-center"><p className="cq-eyebrow">{tr('التجربة قدامك')}</p><h2>{tr('الناس تلمس المنتج.')} <span>{tr('وجهتك تفتح.')}</span></h2><p>{tr('اختار استخدام وشوف مثال مبسط للي بيظهر على الموبايل.')}</p></div><HomeDemo/></section>

    <section className="cq-section cq-products" id="products"><div className="cq-section-heading"><div><p className="cq-eyebrow">{tr('عائلة CliQo')}</p><h2>{tr('نفس الفكرة.')} <span>{tr('بأشكال تناسبك.')}</span></h2></div><Link className="cq-inline-link" href="/products">{tr('كل المنتجات')} <span className="cq-arrow">↗</span></Link></div><div className="st-product-grid">{products.map((product) => <ProductShowcaseCard key={product.slug} product={product} available={available(product.slug)}/>)}</div><p className="cq-fineprint">{tr('الصور تصورات بصرية. الشراء متاح فقط للمنتجات المعتمدة والمتوفرة؛ حالة كل منتج موضحة على بطاقته.')}</p></section>

    <section className="cq-section cq-control cq-shell"><div className="cq-control-copy"><p className="cq-eyebrow cq-eyebrow-light">{tr('القوة في اللي بيحصل بعد اللمسة')}</p><h2>{tr('قطعتك ثابتة.')}<br/><em>{tr('وأنت اللي تتحكم.')}</em></h2><p>{tr('غيّر وجهة الرابط ضمن استخدام قطعتك، أو حدّث صفحة روابطك على المنتجات المدعومة. كل ده من نفس الحساب.')}</p><ul><li>{tr('عدّل الوجهة بدون إعادة طباعة QR.')}</li><li>{tr('شارك صفحة واحدة بين قطع مؤهلة، أو خصص صفحة لكل قطعة.')}</li><li>{tr('تابع الفتحات والنقرات، وأوقف القطعة وقت ما تحتاج.')}</li></ul><Link className="cq-button cq-button-cream" href="/dashboard">{tr('افتح لوحة العميل')}<span className="cq-arrow">↗</span></Link></div>
      <div className="cq-control-preview"><div className="cq-preview-top"><span>CliQo<span className="cq-orange">↗</span></span><small>{tr('معاينة توضيحية')}</small></div><div className="cq-preview-heading"><span className="cq-preview-avatar">C</span><div><small>{tr('لوحة العميل')}</small><strong>{tr('كل حاجة تحت تحكمك.')}</strong></div><span className="cq-status-dot"/></div><div className="cq-preview-items"><div><span>{tr('وجهة القطعة')}</span><b dir="ltr">cliqo.example/your-page</b><span className="cq-preview-edit">{tr('تعديل')}</span></div><div><span>{tr('صفحة الروابط')}</span><strong>{tr('اسم نشاطك وروابطك')}</strong><span className="cq-preview-edit">{tr('إدارة')}</span></div><div><span>{tr('حالة القطعة')}</span><strong>{tr('أنت تتحكم في التشغيل')}</strong><span className="cq-preview-toggle" aria-hidden="true"/></div></div><div className="cq-preview-stats"><div><span aria-hidden="true">↗</span><strong>{tr('فتحات الرابط')}</strong><small>{tr('اعرف حجم التفاعل')}</small></div><div><span aria-hidden="true">◎</span><strong>{tr('نقرات الأزرار')}</strong><small>{tr('داخل صفحة CliQo')}</small></div></div><p className="cq-preview-note">{tr('الفتحات والنقرات تقيس التفاعل؛ لا تؤكد إتمام الإجراء على منصة خارجية.')}</p></div>
    </section>

    <section className="cq-section cq-custom"><div className="cq-section-heading"><div><p className="cq-eyebrow">{tr('على ذوقك وطريقتك')}</p><h2>{tr('جاهز تبدأ؟')} <span>{tr('أو نخليه بطابعك؟')}</span></h2></div><p>{tr('اختار طريقة تجهيز المنتج المناسبة ليك. تفاصيل النسخ المتاحة بتظهر في صفحة المنتج.')}</p></div><div className="cq-custom-grid">{[
      ['T0', 'قالب جاهز', 'اختار من الأوجه الجاهزة. بعد الاستلام، فعّل القطعة واضبط الوجهة واكتب رابط CliQo على NFC بنفسك باتباع الدليل.', 'إعدادك بنفسك'],
      ['T1', 'تصميمك الجاهز', 'قدّم ملف التصميم ورابط الوجهة. CliQo تجهز الوجهة الأولى وتكتب رابط القطعة على NFC وتختبره قبل الشحن.', 'ملفك، وتجهيزنا'],
      ['T2', 'نصممه معاك', 'شارك الفكرة والشعار والرابط. خدمة تصميم برسوم منفصلة وجولة تعديل واحدة، مع الاعتماد قبل الطباعة وتجهيز NFC.', 'فكرتك بطابعك'],
    ].map(([code,title,body,tag])=><article key={code}><div><b>{code}</b><small>{tr(tag)}</small></div><h3>{tr(title)}</h3><p>{tr(body)}</p><Link href="/products/stand#stand-options">{tr('شوف خيارات الستاند')}<span className="cq-arrow">↗</span></Link></article>)}</div></section>

    <section className="cq-section cq-why cq-shell"><div><p className="cq-eyebrow">{tr('ليه CliQo؟')}</p><h2>{tr('تفاصيل صغيرة.')}<br/><span>{tr('تفرق كل يوم.')}</span></h2><p>{tr('تقنية تخدم التواصل، وتحكم يفضل معاك بعد الشراء.')}</p></div><div className="cq-why-grid">{[
      ['⌁','اختيارين للوصول','NFC بهاتف متوافق، وQR بالكاميرا لنفس رابط القطعة.'],
      ['↗','الرابط ثابت','غيّر الوجهة المسموح بها من غير تبديل القطعة أو الكود.'],
      ['☷','حسابك، وتحكمك','إدارة القطع والصفحات والإعدادات من مكان واحد.'],
      ['◎','تفاعل واضح','فتحات الرابط ونقرات الأزرار داخل صفحات CliQo.'],
    ].map(([symbol,title,body])=><div key={title}><span aria-hidden="true">{symbol}</span><h3>{tr(title)}</h3><p>{tr(body)}</p></div>)}</div></section>

    <section className="cq-section cq-faq"><div><p className="cq-eyebrow">{tr('قبل أول لمسة')}</p><h2>{tr('كل حاجة أوضح.')}<br/><span>{tr('قبل ما تختار.')}</span></h2><Link className="cq-inline-link" href="/faq">{tr('كل الأسئلة الشائعة')}<span className="cq-arrow">↗</span></Link></div><div>{faq.map(([question, answer])=><details key={question}><summary>{tr(question)}<span aria-hidden="true">＋</span></summary><p>{tr(answer)}</p></details>)}</div></section>

    <section className="cq-final cq-shell"><div><p className="cq-eyebrow cq-eyebrow-light">One Click .. You’re There</p><h2>{tr('خلّي الخطوة الجاية أسهل.')}</h2><p>{tr('اكتشف المنتج المناسب ليك، أو فعّل قطعتك وابدأ تتحكم في تجربتك.')}</p></div><div className="cq-actions"><Link href="/products" className="cq-button cq-button-primary">{tr('استكشف المنتجات')}<span className="cq-arrow">↗</span></Link><Link href="/activate" className="cq-button cq-button-outline">{tr('معاك قطعة؟ فعّلها')}</Link></div></section>
  </main><MarketingFooter/></>;
}
