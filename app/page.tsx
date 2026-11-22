import Image from 'next/image';
import Link from 'next/link';
import {LuArrowLeft, LuArrowRight, LuArrowUpRight, LuContactRound, LuCreditCard, LuLink2, LuStar} from 'react-icons/lu';
import {getCopy} from '@/i18n/server';
import {getCatalogProducts} from '@/lib/catalog';
import {designsForProduct} from '@/lib/catalog-designs';
import {SiteNav} from './site-nav';
import {MarketingFooter} from './marketing-footer';
import {catalogHref} from './products/catalog-options';
import './products/shop-discovery.css';

export const dynamic='force-dynamic';
const familyOrder=['stand','coaster','card'];
const familyNotes = {
  stand: ['للكاونتر والاستقبال', 'For counters and receptions'],
  coaster: ['للطاولات', 'For tables'],
  card: ['للمقابلات والشغل', 'For meetings and work'],
} as const;

const featuredFaces = {stand: 'review', coaster: 'all-in-one', card: 'all-in-one'} as const;

const shopUses = [
  { use: 'التقييمات', ar: 'تقييمات Google', en: 'Google reviews', icon: LuStar },
  { use: 'صفحة روابط', ar: 'صفحة روابط', en: 'Link page', icon: LuLink2 },
  { use: 'التواصل الاجتماعي', ar: 'حسابات التواصل', en: 'Social profiles', icon: LuContactRound },
  { use: 'الدفع للتاجر', ar: 'بيانات الدفع للتاجر', en: 'Merchant payment details', icon: LuCreditCard },
];

export default async function Home(){
  const tr=await getCopy();const ar=tr.locale==='ar';const pick=(arabic:string,english:string)=>ar?arabic:english;
  const products = await getCatalogProducts();
  const featuredFamilies = familyOrder.flatMap(slug => products.filter(product => product.slug === slug));
  const designsByFamily = new Map(products.map(product => [product.slug, designsForProduct(product)]));
  const cardAvailable = featuredFamilies.some(product => product.slug === 'card');
  const Forward = ar ? LuArrowLeft : LuArrowRight;
  const onlyPhoto = featuredFamilies[0]?.images[0];
  const availableUses = new Set(Array.from(designsByFamily.values()).flat().map(design => design.categoryAr));
  const useCases = shopUses.filter(item => availableUses.has(item.use));
  const featuredDesigns = featuredFamilies.flatMap(product => {
    const designs = designsByFamily.get(product.slug) ?? [];
    const face = featuredFaces[product.slug as keyof typeof featuredFaces];
    const design = designs.find(item => item.face === face);
    const image = design?.images[0]?.src ?? product.images[0];
    return design && image ? [{product, design, image}] : [];
  });
  return <><SiteNav/><main className="campaign-home">
    <section className="shop-home-hero" aria-labelledby="shop-home-title">
      <figure className={cardAvailable ? 'shop-hero-visual' : 'shop-hero-visual shop-hero-visual--fallback'}>
        {cardAvailable ? (
          <picture>
            <source media="(max-width: 620px)" srcSet="/campaigns/home/hero-tap-portrait.webp" width={900} height={1125} />
            <img src="/campaigns/home/hero-tap-wide.webp" width={1740} height={744} fetchPriority="high" alt={pick('تصوّر لطريقة استخدام كارت كليكو الذكي مع الموبايل', 'Illustration of tapping a CliQo smart card with a phone')} />
          </picture>
        ) : onlyPhoto ? (
          <Image src={onlyPhoto} alt={ar ? featuredFamilies[0].name : featuredFamilies[0].nameEn} fill sizes="100vw" fetchPriority="high" unoptimized={onlyPhoto.startsWith('http')} />
        ) : <span className="campaign-empty-art" aria-hidden="true" />}
        {(cardAvailable || onlyPhoto) && <figcaption>{pick('تصوّر للاستخدام', 'Illustrative scene')}</figcaption>}
      </figure>
      <div className="shop-hero-copy">
        <div>
          <h1 id="shop-home-title">{pick('خلّي الوصول لنشاطك أسهل.', 'Make your business one tap away.')}</h1>
          <p>{pick('تقييمات Google وروابطك وبيانات التواصل، بلمسة أو مسحة.', 'Google reviews, links and contact details in a tap or a scan.')}</p>
        </div>
        <Link href="/products" className="shop-hero-button">
          {pick('تصفّح المنتجات', 'Browse products')} <Forward aria-hidden="true" />
        </Link>
      </div>
    </section>

    {featuredFamilies.length > 0 && (
      <section className="shop-home-families campaign-width" aria-labelledby="campaign-families-title">
        <div className="shop-home-heading">
          <h2 id="campaign-families-title">{pick('اختار القطعة اللي تناسبك', 'Find your smart product')}</h2>
          <Link href="/products">{pick('كل التصميمات', 'All designs')} <Forward aria-hidden="true" /></Link>
        </div>
        <div className="shop-category-grid">
          {featuredFamilies.map(product => {
            const notes = familyNotes[product.slug as keyof typeof familyNotes];
            const designs = designsByFamily.get(product.slug) ?? [];
            const image = designs.find(design => design.face === 'all-in-one')?.images[0]?.src ?? product.images[0];
            const count = new Set(designs.map(design => design.group)).size;
            return (
              <Link className={`shop-category shop-category--${product.slug}`} key={product.slug} href={catalogHref({family:product.slug})}>
                <div className="shop-category-image">
                  <Image src={image} alt="" fill sizes="(max-width: 620px) 65vw, (max-width: 1250px) 33vw, 435px" unoptimized={image.startsWith('http')} />
                </div>
                <div className="shop-category-label">
                  <div>
                    <p>{ar ? notes[0] : notes[1]}</p>
                    <h3>{ar ? product.name : product.nameEn}</h3>
                    {count > 0 && <span>{count} {pick('تصميم', count === 1 ? 'design' : 'designs')}</span>}
                  </div>
                  <span className="shop-category-arrow"><Forward aria-hidden="true" /></span>
                </div>
              </Link>
            );
          })}
        </div>
        <p className="shop-catalog-note">{pick('صور القطع استرشادية.', 'Product mockups are illustrative.')}</p>
      </section>
    )}
    {featuredDesigns.length > 0 && (
      <section className="shop-home-featured campaign-width" aria-labelledby="shop-featured-title">
        <div className="shop-home-heading">
          <h2 id="shop-featured-title">{pick('تصميمات مختارة', 'Featured designs')}</h2>
          <Link href="/products">{pick('شوف كل المنتجات', 'See all products')} <Forward aria-hidden="true" /></Link>
        </div>
        <div className="shop-featured-grid">
          {featuredDesigns.map(({product, design, image}) => (
            <Link className={`shop-featured-item shop-featured-item--${product.slug}`} key={design.id}
              href={`/products/${product.slug}?design=${encodeURIComponent(design.id)}`}>
              <span className="shop-featured-photo">
                <Image src={image} alt="" fill sizes="(max-width: 700px) 53vw, 31vw" unoptimized={image.startsWith('http')} />
              </span>
              <span className="shop-featured-title">
                <span>{ar ? product.name : product.nameEn}</span>
                <strong>{ar ? design.nameAr : design.nameEn}</strong>
                <Forward aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    )}
    {useCases.length > 0 && (
      <section className="shop-home-uses campaign-width" aria-labelledby="campaign-use-title">
        <div className="shop-home-heading"><h2 id="campaign-use-title">{pick('تسوّق حسب الهدف', 'Shop by goal')}</h2></div>
        <div className="shop-goal-grid">
          {useCases.map(({use, ar: labelAr, en, icon: Icon}) => (
            <Link key={use} href={catalogHref({use})}>
              <span className="shop-goal-icon"><Icon aria-hidden="true" /></span>
              <strong>{pick(labelAr, en)}</strong>
              <LuArrowUpRight aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    )}
    <section className="campaign-setup"><div className="campaign-width"><div className="campaign-heading"><div><span className="campaign-kicker">{pick('من الطلب لأول لمسة','From order to first tap')}</span><h2>{pick('انت اللي تختار طريقة التجهيز.','Choose how your item gets set up.')}</h2></div></div><div className="campaign-setup-grid"><div><span>01</span><h3>{pick('قالب جاهز','Ready template')}</h3><p>{pick('بعد الاستلام: فعّل قطعتك بالكود، اضبط رابطها من حسابك، واكتب رابط CliQo على NFC باتباع الدليل. QR المطبوع جاهز برابطه الفريد.','After delivery, claim your item, set its destination, and write its CliQo URL to NFC using the guide. Its printed QR already has a unique URL.')}</p></div><div><span>02</span><h3>{pick('تصميمك الخاص','Custom design')}</h3><p>{pick('ابعت الرابط والتصميم أثناء الطلب. CliQo تضبط الوجهة الأولى وتبرمج NFC قبل الشحن، وبعدها تقدر تغيّر الوجهة من حسابك.','Send your link and design with the order. CliQo sets the first destination and programs NFC before shipping. You can update it later.')}</p></div></div><Link href="/how-it-works" className="campaign-text-link">{pick('شوف التجربة خطوة بخطوة','See the full process')} <span aria-hidden="true">←</span></Link></div></section>
    <section className="campaign-proof campaign-width"><div><span className="campaign-kicker">{pick('التحكم بعد الاستلام','Control after delivery')}</span><h2>{pick('القطعة ثابتة. محتواها يفضل بإيدك.','The item stays. Its destination stays in your hands.')}</h2><p>{pick('لصفحات الروابط: عدّل الغلاف والأزرار من لوحة العميل، وراجع فتحات الصفحة ونقرات الأزرار. الستاند والكوستر والكارت يقدروا يشتركوا في صفحة واحدة أو كل قطعة لها صفحتها.','For link pages, edit the cover and buttons from your dashboard, then view page opens and button clicks. A stand, coaster and card can share a page or use separate pages.')}</p><Link href="/guides" className="campaign-text-link">{pick('شوف دليل التفعيل','See the activation guide')} <span aria-hidden="true">←</span></Link></div><div className="campaign-proof-visual"><Image src="/products/mockups/cards/main-black.webp" alt={pick('تصوّر للوجه الأمامي والخلفي لكارت CliQo','Illustration of the front and back of a CliQo card')} fill sizes="(max-width: 760px) 100vw, 46vw"/></div></section>
    <section className="campaign-questions campaign-width"><div className="campaign-heading"><div><span className="campaign-kicker">{pick('قبل ما تختار','Before you choose')}</span><h2>{pick('الأسئلة اللي بتوقف القرار.','Answers before you decide.')}</h2></div></div><div className="campaign-question-list"><details><summary>{pick('هل الزائر محتاج تطبيق أو حساب؟','Does the visitor need an app or account?')}</summary><p>{pick('لا. بيفتح الرابط من المتصفح بعد لمسة NFC أو مسحة QR. حساب CliQo مطلوب لمالك القطعة فقط عشان يضبطها.','No. The destination opens in a browser by NFC or QR. Only the item owner needs a CliQo account to manage it.')}</p></details><details><summary>{pick('لو غيرت الرابط، هحتاج أطبع QR جديد؟','Do I need a new printed QR when my link changes?')}</summary><p>{pick('لا. QR المطبوع يفتح رابط CliQo ثابت للقطعة، والوجهة تتعدل من لوحة العميل ضمن نوع الاستخدام المطبوع عليها.','No. The printed QR points to a stable CliQo item URL. Update its destination in your dashboard within its printed use.')}</p></details><details><summary>{pick('مين بيبرمج NFC؟','Who programs NFC?')}</summary><p>{pick('في القالب الجاهز أنت تبرمجه بعد الاستلام بالدليل. في التصميم المخصص CliQo تبرمجه وتختبره قبل الشحن.','With a ready template, you write NFC after delivery using the guide. For custom design, CliQo programs and tests it before shipping.')}</p></details></div></section>
    <section className="campaign-end"><div className="campaign-width"><div><span className="campaign-kicker">CliQo · One Click .. You’re There</span><h2>{pick('خلي الخطوة الجاية جاهزة للّحظة الجاية.','Be ready for the next moment.')}</h2><p>{pick('اختار الهدف والقطعة والتصميم. الطلب يفتح بعد اعتماد العينة والسعر والتجهيز.','Choose your goal, product and design. Ordering opens after sample, price and setup approval.')}</p></div><Link href="/products">{pick('اختار تصميمك','Find your design')} <span aria-hidden="true">←</span></Link></div></section>
  </main><MarketingFooter/></>;
}
