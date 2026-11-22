import Link from 'next/link';
import { requireStaff } from '@/lib/admin';
import { getDb } from '@/lib/db';
import { getCopy } from '@/i18n/server';
import { AdminShell } from './admin-shell';

export const dynamic = 'force-dynamic';
type Snapshot = { orders: number; needs_work: number; ready_to_ship: number; customers: number; active_items: number; waiting_items: number; low_stock: number };
export default async function AdminPage() {
  const tr = await getCopy();
  const { staff } = await requireStaff();
  const { rows } = await getDb().query<Snapshot>(`select
    (select count(*)::int from public.orders where payment_method<>'test') as orders,
    (select count(*)::int from public.orders where payment_method<>'test' and state in ('new','confirmed','awaiting_design','in_production','quality_check')) as needs_work,
    (select count(*)::int from public.orders where payment_method<>'test' and state='ready_to_ship') as ready_to_ship,
    (select count(*)::int from public.customers) as customers,
    (select count(*)::int from public.smart_items i join public.product_skus s on s.id=i.sku_id where not s.checkout_test and i.state='claimed') as active_items,
    (select count(*)::int from public.smart_items i join public.product_skus s on s.id=i.sku_id where not s.checkout_test and i.state in ('ready','unassigned')) as waiting_items,
    (select count(*)::int from public.product_skus s join public.inventory_balances b on b.sku_id=s.id
      where s.state='ready' and s.price_approved and s.sample_approved and s.fulfillment_approved
      and b.on_hand-b.reserved between 1 and 5) as low_stock`);
  const data=rows[0];
  const steps=[
    {n:'01',title:tr('المنتجات'),desc:tr('الصور، الوصف، الظهور وحالة النسخ'),href:'/cliqo-control/products',owner:true},
    {n:'02',title:tr('المخزون والقطع'),desc:tr('اعتماد النسخة، استلام القطع، QR وفحص NFC'),href:'/cliqo-control/inventory',owner:false},
    {n:'03',title:tr('الطلبات'),desc:tr('الدفع، التصميم، التجهيز والشحن'),href:'/cliqo-control/orders',owner:false},
    {n:'04',title:tr('العملاء'),desc:tr('طلبات كل عميل وقطعته وحالة تفعيلها'),href:'/cliqo-control/customers',owner:false},
  ].filter(step=>!step.owner||staff.role==='owner').filter(step=>step.href!=='/cliqo-control/customers'||staff.role!=='fulfillment').filter(step=>step.href!=='/cliqo-control/inventory'||staff.role!=='support');
  return <AdminShell staffName={staff.display_name} staffRole={staff.role}><section className="ops-content admin-home">
    <div className="ops-heading"><div><p className="ops-eyebrow">{tr('لوحة إدارة المشروع')}</p><h1>{tr('نظرة عامة')}</h1><p>{tr('أرقام فعلية وخطوات العمل من المنتج حتى تسليم القطعة.')}</p></div></div>
    <div className="ops-metrics"><article><span>{tr('كل الطلبات')}</span><strong>{data.orders}</strong><small>{tr('من السجل الكامل')}</small></article><article><span>{tr('تحتاج متابعة')}</span><strong>{data.needs_work}</strong><small>{tr('قبل الشحن')}</small></article><article><span>{tr('جاهزة للشحن')}</span><strong>{data.ready_to_ship}</strong><small>{tr('بانتظار شركة الشحن')}</small></article><article><span>{tr('العملاء')}</span><strong>{data.customers}</strong><small>{tr('كل الحسابات')}</small></article></div>
    <div className="admin-home-grid"><section className="admin-home-workflow"><div className="admin-home-heading"><h2>{tr('مسار العمل')}</h2><p>{tr('اتبع الخطوة المناسبة؛ سجل القطع وملفات QR داخل المخزون الآن.')}</p></div><div className="admin-home-steps">{steps.map(step=><Link href={step.href} key={step.n}><span>{step.n}</span><div><strong>{step.title}</strong><small>{step.desc}</small></div><b aria-hidden="true">←</b></Link>)}</div></section><section className="admin-home-alerts"><h2>{tr('ما يحتاج انتباهك')}</h2><Link href="/cliqo-control/inventory#smart-items"><strong>{data.waiting_items}</strong><span>{tr('قطعة بانتظار التفعيل أو التجهيز')}</span></Link><Link href="/cliqo-control/inventory"><strong>{data.low_stock}</strong><span>{tr('نسخة معتمدة متبقّي منها ١ إلى ٥ قطع')}</span></Link><Link href="/cliqo-control/orders"><strong>{data.needs_work}</strong><span>{tr('طلب يحتاج متابعة')}</span></Link><p>{tr('راجع QR والرابط والفحص الفعلي قبل تسليم أي قطعة. الرابط العام ليس كود تفعيل.')}</p></section></div>
    <p className="admin-home-note">{tr('القطعة النشطة')}: {data.active_items} · {tr('الأرقام من قاعدة البيانات الحالية ولا تتضمن تقديرات.')}</p>
  </section></AdminShell>;
}
