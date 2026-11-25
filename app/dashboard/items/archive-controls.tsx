"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCopy } from "@/i18n/client";
import styles from "../workspace.module.css";

export function ArchiveControls({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const tr = useCopy();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function changeArchive() {
    if (!archived && !window.confirm(tr("الأرشفة هتوقف رابط القطعة. تقدر ترجعها من الأرشيف في أي وقت. تأرشفها؟"))) return;
    setError(false);
    startTransition(async () => {
      const updates = archived ? { archived_at: null } : { archived_at: new Date().toISOString(), state: "disabled" };
      const supabase = createClient();
      const result = await supabase.from("smart_items").update(updates).eq("id", id).select("id").single();
      if (result.error) {
        setError(true);
        return;
      }
      router.replace(archived ? "/dashboard#items" : "/dashboard?view=archive#items");
      router.refresh();
    });
  }

  return <section className={styles.settingsPanel}>
    <div>
      <h2>{tr(archived ? "القطعة في الأرشيف" : "أرشفة القطعة")}</h2>
      <p>{tr(archived ? "بعد الاسترجاع، تقدر تشغّل الرابط من إعدادات القطعة." : "الأرشفة بتوقف الرابط وبتحفظ إعدادات القطعة وإحصائياتها.")}</p>
      {error && <p role="alert">{tr("تعذر تحديث الأرشيف. جرّب تاني.")}</p>}
    </div>
    <button type="button" className={styles.secondary} onClick={changeArchive} disabled={pending}>
      {tr(pending ? "جاري الحفظ…" : archived ? "استرجاع القطعة" : "أرشفة القطعة")}
    </button>
  </section>;
}
