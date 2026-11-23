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
    <div className="customer-list-toolbar"><form method="get" className="customer-search"><label className="sr-only" htmlFor="customer-search">{tr('ابحث بالاسم أو الهاتف أو البريد')}</label><input id="customer-search" name="q" defaultValue={q} placeholder={tr('اكتب اسم العميل أو رقم الهاتف')} /><button type="submit">{tr('بحث')}</button>{q && <Link href="/cliqo-control/customers">{tr('مسح')}</Link>}</form><span>{tr('إجمالي العملاء')}: <strong>{allCustomers}</strong></span></div>
    <div className="customer-table-wrap"><table className="orders-table customer-table"><thead><tr>
      <th>{tr('العميل')}</th><th>{tr('التواصل')}</th><th>{tr('الطلبات')}</th><th>{tr('القطع')}</th><th>{tr('تفعيل القطع')}</th><th>{tr('آخر طلب')}</th><th>{tr('')}</th>
    </tr></thead><tbody>{rows.map(customer => <tr key={customer.id}>
      <td><strong>{customer.full_name}</strong><small>{tr('وجهة واحدة')} {customer.single_count} · {tr('صفحة روابط')} {customer.page_count}</small></td>
      <td><a dir="ltr" href={`tel:${customer.phone_e164}`}>{customer.phone_e164}</a>{customer.email && <small><a dir="ltr" href={`mailto:${customer.email}`}>{customer.email}</a></small>}</td>
      <td><strong>{customer.order_count}</strong></td><td>{customer.units_purchased}</td>
      <td>{customer.active_count} {tr('مفعّلة')}<small>{customer.waiting_count} {tr('بانتظار التفعيل')}</small></td>
      <td>{customer.last_order ? date(customer.last_order) : '—'}</td>
      <td><Link className="customer-orders-link" href={`/cliqo-control/orders?q=${encodeURIComponent(customer.phone_e164)}`}>{tr('الطلبات ←')}</Link></td>
    </tr>)}{rows.length === 0 && <tr><td colSpan={7} className="empty-results">{total ? tr('لا توجد نتائج في هذه الصفحة.') : tr('لا يوجد عميل مطابق للبحث.')}</td></tr>}</tbody></table></div>
    <nav className="customer-pagination" aria-label={tr('صفحات العملاء')}>
      {current > 1 && <Link href={href(current-1)}>{tr('السابق')}</Link>}
      <span>{tr('صفحة')} {current} {tr('من')} {pages} · {total} {tr('عميل')}</span>
      {current < pages && <Link href={href(current+1)}>{tr('التالي')}</Link>}
    </nav>
  </section></AdminShell>;
}
