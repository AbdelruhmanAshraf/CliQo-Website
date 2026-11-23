'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type TouchEvent } from 'react';
import { LuChevronLeft, LuChevronRight, LuLink2, LuScanLine, LuSmartphone } from 'react-icons/lu';
import type { CatalogProduct } from '@/lib/catalog';
import type { CatalogDesign } from '@/lib/catalog-designs';
import type { ProductArtwork } from '@/lib/product-artwork';
import type { SaleSku } from '@/lib/sale-skus';
import { CartAddButton } from '../cart-add-button';
import type { CustomDesign } from '../cart-provider';

const specNames: Record<string, [string, string]> = {
  material: ['الخامة', 'Material'],
  size: ['المقاس', 'Size'],
  connection: ['الاتصال', 'Connection'],
  setup: ['التجهيز', 'Setup'],
};

const destinations: Record<string, { name: string; details: [string, string] }> = {
  review: { name: 'Google', details: ['بتفتح صفحة تقييمات Google لنشاطك.', 'Opens the Google review page for your business.'] },
  instagram: { name: 'Instagram', details: ['بيفتح حساب Instagram اللي بتحدده.', 'Opens the Instagram account you choose.'] },
  facebook: { name: 'Facebook', details: ['بيفتح صفحة Facebook اللي بتحددها.', 'Opens the Facebook page you choose.'] },
  tiktok: { name: 'TikTok', details: ['بيفتح حساب TikTok اللي بتحدده.', 'Opens the TikTok account you choose.'] },
  instapay: { name: 'InstaPay', details: ['بتظهر بيانات InstaPay الخاصة بالتاجر.', 'Shows the merchant’s InstaPay details.'] },
  vodafone: { name: 'Vodafone Cash', details: ['بتظهر بيانات Vodafone Cash الخاصة بالتاجر.', 'Shows the merchant’s Vodafone Cash details.'] },
};

type Props = {
  product: CatalogProduct;
  designs: CatalogDesign[];
  skus: SaleSku[];
  locale: string;
  initialDesign?: string;
};

type Setup = 'T0' | 'T1' | 'T2';


export function ProductExperience({ product, designs, skus, locale, initialDesign }: Props) {
  const ar = locale === 'ar';
  const t = (arabic: string, english: string) => ar ? arabic : english;
  const requested = designs.find(design => design.id === initialDesign);
  const [category, setCategory] = useState(requested?.categoryAr ?? '');
  const [selected, setSelected] = useState(requested?.id ?? designs[0]?.id);
  const [photo, setPhoto] = useState(0);
  const [tier, setTier] = useState<Setup>('T0');
  const [now, setNow] = useState<number | null>(null);
  const [custom, setCustom] = useState<CustomDesign | null>(null);
  const touchStart = useRef<{x: number; y: number} | null>(null);

  useEffect(() => {
    if (!product.saleEndsAt) return;
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 60000);
    return () => window.clearInterval(timer);
  }, [product.saleEndsAt]);

  const active = designs.find(design => design.id === selected) ?? designs[0];
  const familyName = ar ? product.name : product.nameEn;
  const designName = ar ? active?.nameAr : active?.nameEn;
  const title = designName?.startsWith('كارت') || designName?.endsWith('Card')
    ? designName
    : [familyName, designName].filter(Boolean).join(' · ');
  const images: ProductArtwork[] = active?.images.length
    ? active.images
    : product.images.map((src, index) => ({ src, label: `${index + 1}`, side: null, kind: 'mockup' }));
  const index = Math.min(photo, Math.max(0, images.length - 1));
  const image = images[index];
  const categories = new Map(designs.map(design => [design.categoryAr, ar ? design.categoryAr : design.categoryEn]));
  const groups = new Map<string, CatalogDesign>();
  for (const design of designs) {
    if ((!category || design.categoryAr === category) && !groups.has(design.group)) groups.set(design.group, design);
  }
  const finishes = designs.filter(design => design.group === active?.group);
  const remaining = product.saleEndsAt && now !== null ? Math.max(0, Date.parse(product.saleEndsAt) - now) : null;
  const saleEnded = remaining === 0;
  const saleSku = saleEnded ? undefined : skus.find(sku =>
    (!sku.options.face || sku.options.face === active?.face)
    && (!sku.options.variant || sku.options.variant === active?.variant)
    && (sku.options.design ?? 'T0') === tier
  );
  const formatPrice = (value: number) => `${new Intl.NumberFormat(ar ? 'ar-EG' : 'en-EG').format(value)} ${t('ج.م', 'EGP')}`;
  const destination = active ? destinations[active.face] : undefined;
  const linkPage = active?.face === 'all-in-one';
  const destinationDetails = linkPage
    ? t('بتفتح صفحة روابط تقدر تغيّر أزرارها ومحتواها من لوحة العميل.', 'Opens a link page you can edit from your dashboard.')
    : destination ? t(...destination.details) : undefined;
  const description = (ar ? active?.descriptionAr : active?.descriptionEn) || destinationDetails || (ar ? product.description : product.descriptionEn);
  const saleStatus = saleSku
    ? t('متاح للطلب', 'Available to order')
    : saleEnded
      ? t('انتهت فترة الإتاحة', 'Sale window ended')
      : skus.length
        ? t('الاختيار ده مش متاح للطلب', 'This option is unavailable')
        : t('قيد اعتماد العينة والسعر', 'Sample and price approval pending');

  const setupOptions: { value: Setup; label: string; hint: string }[] = [
    { value: 'T0', label: t('قالب جاهز', 'Ready template'), hint: t('تبرمجه بنفسك', 'Program it yourself') },
    { value: 'T1', label: t('تصميمك الجاهز', 'Your own artwork'), hint: t('كليكو تبرمجه لك', 'CliQo programs it') },
    { value: 'T2', label: t('تصميم من كليكو', 'Design by CliQo'), hint: t('كليكو تصممه وتبرمجه', 'CliQo designs and programs it') },
  ];

  function selectDesign(design: CatalogDesign) {
    setSelected(design.id);
    setPhoto(0);
    setCustom(null);
    const url = new URL(window.location.href);
    url.searchParams.set('design', design.id);
    window.history.replaceState(null, '', url);
  }

  function selectCategory(value: string) {
    setCategory(value);
    if (!value || value === active?.categoryAr) return;
    const first = designs.find(design => design.categoryAr === value);
    if (first) selectDesign(first);
  }

  function swipePhoto(event: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    const end = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !end) return;
    const horizontal = end.clientX - start.x;
    const vertical = end.clientY - start.y;
    if (Math.abs(horizontal) < 45 || Math.abs(horizontal) <= Math.abs(vertical)) return;
    const next = ar ? horizontal > 0 : horizontal < 0;
    setPhoto(Math.max(0, Math.min(images.length - 1, index + (next ? 1 : -1))));
  }

  function previewCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const details = new FormData(event.currentTarget);
    setCustom({
      businessName: String(details.get('businessName') ?? '').trim(),
      destinationUrl: String(details.get('destinationUrl') ?? '').trim(),
      brief: String(details.get('brief') ?? '').trim() || undefined,
    });
  }

  const PrevIcon = ar ? LuChevronRight : LuChevronLeft;
  const NextIcon = ar ? LuChevronLeft : LuChevronRight;
  const caption = image?.kind === 'mockup'
    ? t('تصوّر للمنتج', 'Illustrative mockup')
    : image?.kind === 'preview'
      ? t('تصميم مع QR للمعاينة', 'Artwork with a preview QR')
      : image?.kind === 'photo'
        ? t('صورة المنتج', 'Product photo')
        : t('تصميم الطباعة الأصلي', 'Original print artwork');

  return (
    <>
      <section className="store-product-main shop-product-main">
        <div className="store-product-visual shop-product-gallery" aria-label={t('صور المنتج', 'Product photos')}>
          <div
            className="shop-product-stage"
            onTouchStart={event => {
              if (event.touches.length === 1) touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            }}
            onTouchCancel={() => { touchStart.current = null; }}
            onTouchEnd={swipePhoto}
          >
            {image ? (
              <Image key={image.src} src={image.src} alt={`${title} — ${caption}`} fill fetchPriority={index === 0 ? 'high' : undefined}
                sizes="(max-width: 850px) 100vw, 48vw" unoptimized={image.src.startsWith('http')} />
            ) : <span>{t('الصورة قيد التجهيز', 'Image pending')}</span>}
            {images.length > 1 && (
              <>
                <button type="button" className="shop-photo-prev" disabled={index === 0} aria-label={t('الصورة السابقة', 'Previous photo')} onClick={() => setPhoto(index - 1)}>
                  <PrevIcon aria-hidden="true" />
                </button>
                <button type="button" className="shop-photo-next" disabled={index === images.length - 1} aria-label={t('الصورة التالية', 'Next photo')} onClick={() => setPhoto(index + 1)}>
                  <NextIcon aria-hidden="true" />
                </button>
              </>
            )}
          </div>
          {image && (
            <div className="shop-photo-caption" aria-live="polite">
              <span>{caption}</span><span dir="ltr">{index + 1} / {images.length}</span>
            </div>
          )}
          {images.length > 1 && (
            <div className="shop-photo-thumbnails" aria-label={t('اختار صورة', 'Choose a photo')}>
              {images.map((item, position) => (
                <button type="button" key={item.src + position}
                  aria-label={t(`صورة رقم ${position + 1}`, `Photo ${position + 1}`)}
                  title={item.label} aria-pressed={index === position} onClick={() => setPhoto(position)}>
                  <Image src={item.src} alt="" width={60} height={60} unoptimized={item.src.startsWith('http')} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="store-product-info shop-product-info">
          <h1>{title}</h1>
          {description && <p className="shop-product-description">{description}</p>}
          <div className="shop-product-status" aria-live="polite">
            <span>{saleStatus}</span>
            <span dir="ltr">NFC + QR</span>
            {product.badge && <span>{ar ? product.badge : product.badgeEn || product.badge}</span>}
          </div>

          {saleSku && (
            <div className="shop-product-price">
              <strong>{formatPrice(saleSku.priceEgp)}</strong>
              {product.compareAtMinor && product.compareAtMinor > saleSku.priceEgp * 100
                ? <del>{formatPrice(product.compareAtMinor / 100)}</del>
                : null}
            </div>
          )}
          {remaining !== null && remaining > 0 && skus.length > 0 && (
            <div className="store-sale-countdown">
              <strong>
                {t('متاح للشراء حتى', 'Available to purchase until')}{' '}
                <time dateTime={product.saleEndsAt ?? undefined}>{new Date(product.saleEndsAt!).toLocaleString(ar ? 'ar-EG' : 'en-GB')}</time>
              </strong>
            </div>
          )}

          {designs.length > 0 && (
            <section className="shop-product-block" id="choose-design" aria-labelledby="choose-design-title">
              <h2 id="choose-design-title">{t('اختار التصميم', 'Choose a design')}</h2>
              {categories.size > 1 && (
                <div className="shop-design-types" aria-label={t('الاستخدام', 'Use')}>
                  <button type="button" aria-pressed={!category} onClick={() => selectCategory('')}>{t('الكل', 'All')}</button>
                  {Array.from(categories, ([value, label]) => (
                    <button type="button" key={value} aria-pressed={category === value} onClick={() => selectCategory(value)}>{label}</button>
                  ))}
                </div>
              )}
              <div className="shop-design-grid">
                {Array.from(groups.values(), design => {
                  const thumb = design.images[0]?.src ?? product.images[0];
                  return (
                    <button type="button" key={design.group} aria-pressed={active?.group === design.group}
                      onClick={() => { if (active?.group !== design.group) selectDesign(design); }}>
                      {thumb && <span><Image src={thumb} alt="" fill sizes="44px" unoptimized={thumb.startsWith('http')} /></span>}
                      {ar ? design.nameAr : design.nameEn}
                    </button>
                  );
                })}
              </div>
              {finishes.length > 1 && (
                <div className="shop-design-finish">
                  <strong>{t('النسخة', 'Finish')}</strong>
                  <div className="shop-design-types">
                    {finishes.map(finish => (
                      <button type="button" key={finish.id} aria-pressed={active?.id === finish.id} onClick={() => selectDesign(finish)}>
                        {ar ? finish.colorAr ?? finish.variant : finish.colorEn ?? finish.variant}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {destinationDetails && (
            <section className="shop-destination" aria-labelledby="shop-destination-title">
              <div className="shop-destination-copy">
                <LuSmartphone aria-hidden="true" />
                <div>
                  <h2 id="shop-destination-title">{t('إيه اللي هيفتح على الموبايل؟', 'What opens on your phone?')}</h2>
                  <p>{destinationDetails}</p>
                  {destination && ['instapay', 'vodafone'].includes(active?.face ?? '') &&
                    <p>{t('الدفع بيتم على وسيلة التاجر.', 'Payment takes place through the merchant’s payment method.')}</p>}
                </div>
              </div>
              {linkPage ? (
                <div className="shop-link-preview">
                  <strong>{t('اسم نشاطك هنا', 'Your business name')}</strong>
                  <span><LuLink2 aria-hidden="true" /> Instagram</span>
                  <span><LuLink2 aria-hidden="true" /> WhatsApp</span>
                  <small>{t('معاينة لصفحة روابط', 'Link page preview')}</small>
                </div>
              ) : <span className="shop-destination-name"><LuScanLine aria-hidden="true" /> <bdi>{destination?.name}</bdi></span>}
            </section>
          )}

          <section className="shop-product-block" aria-labelledby="shop-setup-title">
            <h2 id="shop-setup-title">{t('طريقة التجهيز', 'Setup option')}</h2>
            <div className="shop-setup-grid">
              {setupOptions.map(({ value, label, hint }) => (
                <label key={value}>
                  <input type="radio" name="tier" checked={tier === value} onChange={() => { setTier(value); setCustom(null); }} />
                  <span><strong>{label}</strong><small>{hint}</small></span>
                </label>
              ))}
            </div>
            {tier === 'T0' ? (
              <p className="shop-setup-details">{t('بعد الاستلام، فعّل القطعة بالكود واضبط الوجهة واكتب رابطها على NFC من الدليل. QR المطبوع جاهز.', 'After delivery, claim your item, set the destination and follow the guide to write its link to NFC. The printed QR is ready.')}</p>
            ) : (
              <form key={`${selected}-${tier}`} className="store-custom-form" onSubmit={previewCustom} onChange={() => setCustom(null)}>
                <label>{t('اسم النشاط', 'Business name')}<input name="businessName" required maxLength={100} /></label>
                <label>{t('الرابط الأول', 'Initial destination URL')}<input name="destinationUrl" type="url" required pattern="https://.*" placeholder="https://" dir="ltr" /></label>
                <label>
                  {tier === 'T2' ? t('تفاصيل التصميم المطلوب', 'Design brief') : t('ملاحظات على ملفك (اختياري)', 'Notes about your artwork (optional)')}
                  <textarea name="brief" rows={3} maxLength={1200} required={tier === 'T2'}
                    placeholder={t('النص اللي يظهر، الألوان، وأي مرجع مهم', 'Text to include, colors, and any reference')} />
                </label>
                <p>{tier === 'T1' ? t('بعد تأكيد الطلب، ارفع ملف التصميم من صفحة المتابعة.', 'After placing the order, upload artwork on the order page.') : t('تقدر تضيف الشعار أو المرجع بعد تأكيد الطلب من صفحة المتابعة.', 'You can add a logo or reference on the order page after checkout.')}</p>
                <button type="submit">{t('تأكيد تفاصيل التصميم', 'Confirm design details')}</button>
                {custom && <small role="status">{t('التفاصيل جاهزة للطلب.', 'Your details are ready for the order.')} {custom.businessName}</small>}
              </form>
            )}
          </section>

          <div className="store-buy-box shop-buy-box">
            {saleSku && (tier === 'T0' || custom) ? (
              <CartAddButton key={saleSku.id} skuId={saleSku.id} slug={product.slug} name={saleSku.displayName} priceEgp={saleSku.priceEgp}
                choices={active ? [active.nameAr, active.variant, tier] : [tier]}
                optionValues={active ? { face: active.face, variant: active.variant, design: tier } : { design: tier }}
                customDesign={tier !== 'T0' && custom ? custom : undefined} />
            ) : (
              <>
                <button type="button" disabled>{saleSku ? t('أكّد تفاصيل التصميم الأول', 'Confirm design details first') : saleStatus}</button>
                {active && <a href="#choose-design">{t('راجع التصميمات', 'Review designs')}</a>}
              </>
            )}
          </div>
        </div>
      </section>

      <section className="shop-product-details" aria-label={t('تفاصيل المنتج والتفعيل', 'Product and activation details')}>
        <details>
          <summary>{t('مواصفات المنتج', 'Product specifications')}</summary>
          <dl>
            {active && (
              <>
                <div><dt>{t('الاستخدام', 'Use')}</dt><dd>{ar ? active.categoryAr : active.categoryEn}</dd></div>
                <div><dt>{t('التصميم', 'Design')}</dt><dd>{ar ? active.nameAr : active.nameEn}</dd></div>
                <div><dt>{t('النسخة', 'Finish')}</dt><dd>{(ar ? active.colorAr : active.colorEn) || active.variant}</dd></div>
              </>
            )}
            {Object.entries((ar ? active?.specsAr : active?.specsEn) ?? (ar ? product.specs : product.specsEn)).map(([key, value]) => (
              <div key={key}><dt>{specNames[key]?.[ar ? 0 : 1] ?? key}</dt><dd>{value}</dd></div>
            ))}
          </dl>
          <p>{t('مواصفات الخامة والطباعة النهائية تعتمد بعد فحص عينة الإنتاج.', 'Final material and print details are confirmed after sample review.')}</p>
        </details>
        <details>
          <summary>{t('بعد ما تستلم قطعتك', 'After you receive your item')}</summary>
          <ol>
            <li>{t('كل قطعة لها QR ورابط CliQo فريد.', 'Every item has a unique QR and CliQo link.')}</li>
            <li>{t('القالب الجاهز تفعّله وتبرمج NFC بنفسك باتباع الدليل.', 'Claim and program a ready template yourself using the guide.')}</li>
            <li>{t('مع التصميم المخصص، تبعت الرابط وكليكو بتبرمج NFC قبل الشحن.', 'For custom designs, send your link and CliQo programs NFC before shipping.')}</li>
            <li>{linkPage ? t('عدّل صفحة الروابط وراجع الفتحات والنقرات من لوحة العميل.', 'Edit your link page and view opens and clicks in your dashboard.') : t('تقدر تغيّر وجهة القطعة من لوحة العميل.', 'Change the item destination from your dashboard.')}</li>
          </ol>
          <Link href="/guides">{t('دليل التفعيل والبرمجة', 'Activation and programming guide')} ←</Link>
        </details>
      </section>
      <p className="store-product-footnote">
        {t('الموكابس استرشادية. أكواد QR في الصور للمعاينة. كل قطعة لها كودها الخاص.', 'Mockups are illustrative. Pictured QR graphics are for preview. Each item has its own code.')}
      </p>
    </>
  );
}
