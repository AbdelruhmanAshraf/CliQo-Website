"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCopy } from "@/i18n/client";
import { createClient } from "@/lib/supabase/client";
import styles from "../workspace.module.css";

export function ProfileForm({ name, phone }: { name: string; phone: string }) {
  const tr = useCopy();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");

  function save(form: FormData) {
    const displayName = String(form.get("name") ?? "").trim();
    const contactPhone = String(form.get("phone") ?? "").trim();
    setStatus("");
    const digits = contactPhone.replace(/[() -]/g, "");
    if (!displayName || (contactPhone && !/^\+?[0-9٠-٩۰-۹]{7,15}$/.test(digits))) {
      setStatus("اكتب اسمك وراجع رقم التليفون.");
      return;
    }
    startTransition(async () => {
      const { error } = await createClient().auth.updateUser({
        data: { cliqo_display_name: displayName, cliqo_contact_phone: contactPhone },
      });
      setStatus(error ? "تعذر حفظ بيانات الحساب. جرّب تاني." : "تم حفظ بيانات الحساب.");
      if (!error) router.refresh();
    });
  }

  return <form action={save} className={styles.profileForm}>
    <fieldset disabled={pending}>
      <label>{tr("الاسم")}<input name="name" dir="auto" autoComplete="name" defaultValue={name} maxLength={80} required /></label>
      <label>{tr("رقم التليفون (اختياري)")}<input name="phone" type="tel" dir="ltr" autoComplete="tel" defaultValue={phone} maxLength={24} /></label>
      <button type="submit" className={styles.primary}>{tr(pending ? "جاري الحفظ…" : "احفظ التعديلات")}</button>
    </fieldset>
    {status && <p role="status">{tr(status)}</p>}
  </form>;
}
