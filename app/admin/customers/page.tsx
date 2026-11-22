import { getCopy } from '@/i18n/server';
import { requireStaff } from '@/lib/admin';
import { getDb } from '@/lib/db';
import { AdminShell } from '../admin-shell';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 40;
type CustomerRow = {
  id: string; full_name: string; phone_e164: string; email: string | null;
  order_count: number; last_order: string | null; units_purchased: number;
  smart_count: number; active_count: number; waiting_count: number;
  single_count: number; page_count: number;
};
export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const tr = await getCopy();
  const { staff } = await requireStaff(['owner', 'admin', 'operations', 'support']);
  const params = await searchParams;
  const q = (params.q ?? '').trim().slice(0, 100).toLowerCase();
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const db = getDb();
  const where = "where ($1 = '' or position($1 in lower(c.full_name || ' ' || c.phone_e164 || ' ' || coalesce(c.email,''))) > 0)";
  const countResult = await db.query<{ total: number }>(`select count(*)::int as total from public.customers c ${where}`, [q]);
  const total = countResult.rows[0]?.total ?? 0;
  const allResult = await db.query<{ total: number }>('select count(*)::int as total from public.customers');
  const allCustomers = allResult.rows[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);
  const { rows } = await db.query<CustomerRow>(`
    select c.id,c.full_name,c.phone_e164,c.email,
      coalesce(o.order_count,0)::int as order_count,o.last_order,
      coalesce(o.units_purchased,0)::int as units_purchased,
      coalesce(i.smart_count,0)::int as smart_count,
      coalesce(i.active_count,0)::int as active_count,
      coalesce(i.waiting_count,0)::int as waiting_count,
      coalesce(i.single_count,0)::int as single_count,
      coalesce(i.page_count,0)::int as page_count
    from public.customers c
    left join lateral (
      select count(distinct ord.id)::int as order_count,max(ord.created_at)::text as last_order,
        coalesce(sum(ol.quantity),0)::int as units_purchased
      from public.orders ord left join public.order_lines ol on ol.order_id=ord.id
      where ord.customer_id=c.id
    ) o on true
    left join lateral (
      select count(si.id)::int as smart_count,
        count(si.id) filter(where si.owner_user_id is not null)::int as active_count,
        count(si.id) filter(where si.owner_user_id is null)::int as waiting_count,
        count(si.id) filter(where si.landing_page_id is null and coalesce(ol.options_snapshot->>'face','')<>'all-in-one')::int as single_count,
        count(si.id) filter(where si.landing_page_id is not null or ol.options_snapshot->>'face'='all-in-one')::int as page_count
      from public.orders ord join public.order_lines ol on ol.order_id=ord.id
        join public.smart_items si on si.order_line_id=ol.id
      where ord.customer_id=c.id
    ) i on true
    ${where}
    order by c.created_at desc,c.id desc limit $2 offset $3`, [q, PAGE_SIZE, (current - 1) * PAGE_SIZE]);
  const href = (next: number) => `/cliqo-control/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(next) })}`;
  const date = (value: string) => tr.date(value);
  return <AdminShell staffName={staff.display_name} staffRole={staff.role}><section className="ops-content">
    <div className="ops-heading"><div><p className="ops-eyebrow">{tr('علاقات العملاء')}</p><h1>{tr('العملاء')} <span className="count-pill">{total}</span></h1><p>{tr('كل العملاء، والطلبات والقطع المرتبطة بكل واحد. البحث يشمل السجل كاملًا.')}</p></div></div>
    <div className="ops-metrics customer-metrics">
      <article><span>{tr('إجمالي العملاء')}</span><strong>{allCustomers}</strong><small>{tr('كل السجلات')}</small></article>
      <article><span>{tr('النتائج المطابقة')}</span><strong>{total}</strong><small>{q ? tr('للبحث الحالي') : tr('من قاعدة العملاء')}</small></article>
      <article><span>{tr('الصفحة الحالية')}</span><strong>{current}</strong><small>{tr('من')} {pages}</small></article>
      <article><span>{tr('المعروض الآن')}</span><strong>{rows.length}</strong><small>{tr('عميل في هذه الصفحة')}</small></article>
    </div>
    <form method="get" className="customer-search"><label htmlFor="customer-search">{tr('ابحث بالاسم أو الهاتف أو البريد')}</label><input id="customer-search" name="q" defaultValue={q} placeholder={tr('اكتب اسم العميل أو رقم الهاتف')} /><button type="submit">{tr('بحث')}</button></form>
    <div className="customer-visual-grid">{rows.map(customer => <article className="customer-visual-card" key={customer.id}>
      <div className="customer-card-head"><span className="customer-avatar">{customer.full_name.slice(0,1)}</span><div><h2>{customer.full_name}</h2><span dir="ltr">{customer.phone_e164}</span>{customer.email && <small dir="ltr">{customer.email}</small>}</div></div>
      <div className="customer-card-stats"><div><strong>{customer.order_count}</strong><span>{tr('طلبات')}</span></div><div><strong>{customer.units_purchased}</strong><span>{tr('قطع مشتراة')}</span></div><div><strong>{customer.active_count}</strong><span>{tr('مفعّلة')}</span></div><div><strong>{customer.waiting_count}</strong><span>{tr('بانتظار التفعيل')}</span></div></div>
      <div className="customer-card-types"><span>{tr('وجهة واحدة')} · {customer.single_count}</span><span>{tr('صفحة روابط')} · {customer.page_count}</span><span>{tr('قطع ذكية')} · {customer.smart_count}</span></div>
      <footer><span>{tr('آخر طلب')}: {customer.last_order ? date(customer.last_order) : '—'}</span><Link href={`/cliqo-control/orders?q=${encodeURIComponent(customer.phone_e164)}`}>{tr('عرض الطلبات ←')}</Link></footer>
    </article>)}{rows.length === 0 && <p className="empty-results">{total ? tr('لا توجد نتائج في هذه الصفحة.') : tr('لا يوجد عميل مطابق للبحث.')}</p>}</div>
    <nav className="customer-pagination" aria-label={tr('صفحات العملاء')}>
      {current > 1 && <Link href={href(current-1)}>{tr('السابق')}</Link>}
      <span>{tr('صفحة')} {current} {tr('من')} {pages} · {total} {tr('عميل')}</span>
      {current < pages && <Link href={href(current+1)}>{tr('التالي')}</Link>}
    </nav>
  </section></AdminShell>;
}
