'use client';
import {useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {useCopy} from '@/i18n/client';

const demos = [
  {id: 'review', label: 'تقييمات Google', eyebrow: 'شاركنا تجربتك', title: 'رأيك يفرق معانا.', body: 'افتح صفحة تقييم النشاط على Google بخطوة سهلة.', action: 'افتح صفحة التقييم', note: 'العميل يكتب تقييمه بحرية على Google.'},
  {id: 'social', label: 'السوشيال', eyebrow: 'خليك قريب', title: 'تواصل يكمل بعد الزيارة.', body: 'وصّل العميل لحساب المنصة المطبوعة على القطعة.', action: 'شوف حساب النشاط', note: 'اختر Instagram أو TikTok أو Facebook لوجه السوشيال.'},
  {id: 'payment', label: 'وسيلة الدفع', eyebrow: 'بيانات واضحة', title: 'وسيلة نشاطك في متناول العميل.', body: 'اعرض وسيلة الدفع المطبوعة وبيانات المستلم.', action: 'راجع بيانات الدفع', note: 'CliQo لا ينفّذ التحويل. العميل يراجع المستلم داخل تطبيق الدفع.'},
  {id: 'links', label: 'كل الروابط', eyebrow: 'صفحتك الرقمية', title: 'كل اللي يهمهم، في مكان واحد.', body: 'صفحة باسمك وصورتك وروابطك، تقدر تعدّلها من حسابك.', action: 'الموقع الإلكتروني', note: 'صفحة الروابط متاحة للمنتجات والأوجه التي تدعمها.'},
] as const;

export function HomeDemo() {
  const tr = useCopy();
  const [active, setActive] = useState<(typeof demos)[number]['id']>('review');
  const demo = demos.find((entry) => entry.id === active)!;
  return <div className="cq-demo">
    <div className="cq-demo-tabs" role="tablist" aria-label={tr('اختار الاستخدام للتجربة')}>
      {demos.map((entry) => <button key={entry.id} id={`demo-tab-${entry.id}`} type="button" role="tab" aria-selected={entry.id === active} aria-controls="demo-preview" tabIndex={entry.id === active ? 0 : -1}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const index = demos.findIndex((item) => item.id === active);
          const offset = (event.key === 'ArrowRight' ? 1 : -1) * (tr.locale === 'ar' ? -1 : 1);
          const next = event.key === 'Home' ? demos[0] : event.key === 'End' ? demos[demos.length - 1] : demos[(index + offset + demos.length) % demos.length];
          setActive(next.id); document.getElementById(`demo-tab-${next.id}`)?.focus();
        }} onClick={() => setActive(entry.id)}>{tr(entry.label)}</button>)}
    </div>
    <div className="cq-demo-stage" id="demo-preview" role="tabpanel" aria-labelledby={`demo-tab-${active}`} tabIndex={0}>
      <div className="cq-demo-product"><Image src="/stitch/stand.webp" alt={tr('تصور بصري لستاند CliQo')} fill sizes="(max-width: 700px) 42vw, 350px" /><span className="cq-caption">{tr('المنتج')} <span aria-hidden="true">＋</span> NFC / QR</span></div>
      <div className="cq-demo-connection" aria-hidden="true"><span />⌁<span /></div>
      <div className="cq-phone"><div className="cq-phone-speaker"/><div className="cq-phone-screen">
        <div className="cq-phone-brand">CliQo<span>↗</span></div><p className="cq-phone-eyebrow">{tr(demo.eyebrow)}</p><h3>{tr(demo.title)}</h3><p>{tr(demo.body)}</p>
        <div className={`cq-demo-symbol cq-demo-${active}`} aria-hidden="true">{active === 'review' ? 'G' : active === 'social' ? '@' : active === 'payment' ? '↗' : 'C'}</div>
        <span className="cq-preview-action">{tr(demo.action)}</span>{active === 'links' && <><span className="cq-preview-secondary">Instagram</span><span className="cq-preview-secondary">{tr('اتصل بنا')}</span></>}
        <small>{tr('معاينة توضيحية')}</small>
      </div></div>
      <div className="cq-demo-explainer"><span className="cq-eyebrow">{tr('من القطعة للشاشة')}</span><h3>{tr('لمسة صغيرة. خطوة أسهل.')}</h3><p>{tr(demo.note)}</p><Link href="/products/stand" className="cq-inline-link">{tr('شوف أوجه الستاند')} <span className="cq-arrow">↗</span></Link></div>
    </div>
    <div className="cq-visitor-steps">{[
      ['01', 'قرّب أو امسح', 'لمسة NFC بهاتف متوافق، أو مسح QR بالكاميرا.'],
      ['02', 'افتح الوجهة', 'الرابط الثابت يوصلك للوجهة اللي اختارها المالك.'],
      ['03', 'كمّل خطوتك', 'تقييم، تواصل، بيانات دفع، أو روابطك المختارة.'],
    ].map(([number, title, body]) => <div key={number}><b>{number}</b><div><h3>{tr(title)}</h3><p>{tr(body)}</p></div></div>)}</div>
  </div>;
}
