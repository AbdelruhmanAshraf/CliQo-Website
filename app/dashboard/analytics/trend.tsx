import type { Copy } from "@/i18n/copy";
import styles from "../dashboard.module.css";

export type TrendBucket = { bucket: string; opens: number; clicks: number };

export function AnalyticsTrend({ buckets, period, tr }: {
  buckets: TrendBucket[]; period: string; tr: Copy;
}) {
  const peak = Math.max(1, ...buckets.flatMap(({ opens, clicks }) => [opens, clicks]));
  const format = new Intl.DateTimeFormat(tr.numberLocale, {
    timeZone: "UTC",
    ...(period === "24h" ? { hour: "numeric", minute: "2-digit" }
      : period === "all" ? { month: "short", year: "numeric" }
      : { day: "numeric", month: "short" }),
  });
  const rows = buckets.map((bucket) => ({
    ...bucket,
    label: format.format(new Date(bucket.bucket + "Z")),
  }));
  const opens = tr("فتحات الرابط");
  const clicks = tr("نقرات الأزرار");
  const hasEvents = buckets.some((bucket) => Number(bucket.opens) > 0 || Number(bucket.clicks) > 0);
  return <section className={styles.trend}>
    <h2>{tr("نشاط الروابط مع الوقت")}</h2>
    {!hasEvents ? <p>{tr("لسه مفيش نشاط مسجل في الفترة دي.")}</p> : <>
      <div className={styles.legend}><span>{opens}</span><span>{clicks}</span></div>
      <div className={styles.plot} aria-hidden="true" dir="ltr">
        {rows.map((row) => <div className={styles.barGroup} key={row.bucket} title={`${row.label} · ${opens} ${tr.number(row.opens)} · ${clicks} ${tr.number(row.clicks)}`}>
          <i style={{ height: `${Number(row.opens) / peak * 100}%` }} />
          <i style={{ height: `${Number(row.clicks) / peak * 100}%` }} />
        </div>)}
      </div>
      <div className={styles.axis} aria-hidden="true" dir="ltr"><span>{rows[0]?.label}</span><span>{rows.at(-1)?.label}</span></div>
      <details>
        <summary>{tr("عرض أرقام الرسم")}</summary>
        <table>
          <thead><tr><th scope="col">{tr("الفترة")}</th><th scope="col">{opens}</th><th scope="col">{clicks}</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.bucket}><th scope="row">{row.label}</th><td>{tr.number(row.opens)}</td><td>{tr.number(row.clicks)}</td></tr>)}</tbody>
        </table>
      </details>
    </>}
  </section>;
}
