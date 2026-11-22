"use client";
import { useCopy } from '@/i18n/client';


import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ServiceIcon } from "@/app/service-icon";
import styles from "../dashboard.module.css";

type PageLink = { id: string | null; label: string; destination_url: string; is_enabled: boolean; icon_key: string };
type PageExtras = {
  contact_name: string; contact_phone: string; contact_email: string; contact_website: string;
  show_save_contact: boolean;
  instapay_identifier: string; instapay_recipient: string;
  vodafone_identifier: string; vodafone_recipient: string;
};
type PageData = {
  id: string; display_name: string; short_description: string; avatar_path: string | null;
  cover_path: string | null; is_published: boolean;
  links: PageLink[];
  avatar_url?: string | null; cover_url?: string | null;
} & PageExtras;

type PageDraft = { displayName: string; shortDescription: string; links: PageLink[]; published: boolean; extras: PageExtras; contactSelected: boolean; instapaySelected: boolean; vodafoneSelected: boolean };

const serviceChoices = [
  { key: "instagram", label: "Instagram", group: "social" },
  { key: "facebook", label: "Facebook", group: "social" },
  { key: "tiktok", label: "TikTok", group: "social" },
  { key: "whatsapp", label: "WhatsApp", group: "social" },
  { key: "youtube", label: "YouTube", group: "social" },
  { key: "linkedin", label: "LinkedIn", group: "social" },
  { key: "website", label: "Website", group: "website" },
] as const;

const emptyExtras: PageExtras = {
  contact_name: "", contact_phone: "", contact_email: "", contact_website: "", show_save_contact: false,
  instapay_identifier: "", instapay_recipient: "", vodafone_identifier: "", vodafone_recipient: "",
};

export function PageEditor({ page, ownerId }: { page: PageData | null; ownerId: string }) {
  const tr = useCopy();

  const router = useRouter();
  const supabase = createClient();
  const draftKey = `cliqo-page-draft:${ownerId}:${page?.id ?? "new"}`;
  const [pageId, setPageId] = useState(page?.id ?? null);
  const [links, setLinks] = useState<PageLink[]>(page?.links ?? []);
  const [extras, setExtras] = useState<PageExtras>(() => Object.fromEntries(
    Object.entries(emptyExtras).map(([key, value]) => [key, page?.[key as keyof PageExtras] ?? value]),
  ) as PageExtras);
  const [contactSelected, setContactSelected] = useState(Boolean(page?.contact_phone || page?.contact_email || page?.contact_website || page?.show_save_contact));
  const [instapaySelected, setInstapaySelected] = useState(Boolean(page?.instapay_identifier));
  const [vodafoneSelected, setVodafoneSelected] = useState(Boolean(page?.vodafone_identifier));
  const [published, setPublished] = useState(page?.is_published ?? false);
  const [displayName, setDisplayName] = useState(page?.display_name ?? "");
  const [shortDescription, setShortDescription] = useState(page?.short_description ?? "");
  const [avatarPreview, setAvatarPreview] = useState(page?.avatar_url ?? null);
  const [coverPreview, setCoverPreview] = useState(page?.cover_url ?? null);
  const [message, setMessage] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draftNotice, setDraftNotice] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setDraftReady(false);
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<PageDraft>;
        const validLinks = Array.isArray(draft.links) && draft.links.length <= 12 && draft.links.every((link) =>
          link && (link.id === null || typeof link.id === "string")
          && typeof link.label === "string" && typeof link.destination_url === "string"
          && typeof link.is_enabled === "boolean" && typeof link.icon_key === "string");
        if (typeof draft.displayName === "string" && typeof draft.shortDescription === "string"
          && validLinks && typeof draft.published === "boolean" && draft.extras && typeof draft.extras === "object") {
          setDisplayName(draft.displayName);
          setShortDescription(draft.shortDescription);
          setLinks(draft.links as PageLink[]);
          setPublished(draft.published);
          setExtras({ ...emptyExtras, ...draft.extras });
          setContactSelected(Boolean(draft.contactSelected));
          setInstapaySelected(Boolean(draft.instapaySelected));
          setVodafoneSelected(Boolean(draft.vodafoneSelected));
          setDirty(true);
          setDraftNotice(true);
        } else sessionStorage.removeItem(draftKey);
      }
    } catch { /* Ignore unavailable tab storage. */ }
    setDraftReady(true);
  }, [draftKey]);

  useEffect(() => {
    if (!draftReady || !dirty) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({displayName, shortDescription, links, published, extras, contactSelected, instapaySelected, vodafoneSelected} satisfies PageDraft));
    } catch { /* The editor remains usable if this tab cannot store a draft. */ }
  }, [draftKey, draftReady, dirty, displayName, shortDescription, links, published, extras, contactSelected, instapaySelected, vodafoneSelected]);

  useEffect(() => () => {
    if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  useEffect(() => () => {
    if (coverPreview?.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
  }, [coverPreview]);

  function editLink(index: number, changes: Partial<PageLink>) {
    setDirty(true);
    setLinks((current) => current.map((link, i) => i === index ? { ...link, ...changes } : link));
  }

  function editExtra<K extends keyof PageExtras>(key: K, value: PageExtras[K]) {
    setDirty(true);
    setExtras((current) => ({ ...current, [key]: value }));
  }

  function toggleService(key: string, label: string, checked: boolean) {
    setDirty(true);
    setLinks((current) => checked
      ? current.some((link) => link.icon_key === key) ? current : [...current, { id: null, label, destination_url: "", is_enabled: true, icon_key: key }]
      : current.filter((link) => link.icon_key !== key));
  }

  function moveLink(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= links.length) return;
    setDirty(true);
    setLinks((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submittedName = String(form.get("displayName") ?? "").trim();
    const submittedDescription = String(form.get("shortDescription") ?? "").trim();
    const avatarFile = form.get("avatar") as File | null;
    const coverFile = form.get("cover") as File | null;
    const enabledLinks = links.filter((link) => link.icon_key !== "link" || link.label.trim() || link.destination_url.trim());
    const savedExtras: PageExtras = {
      ...extras,
      contact_name: contactSelected ? extras.contact_name.trim() : "",
      contact_phone: contactSelected ? extras.contact_phone.trim() : "",
      contact_email: contactSelected ? extras.contact_email.trim() : "",
      contact_website: contactSelected ? extras.contact_website.trim() : "",
      show_save_contact: contactSelected && extras.show_save_contact,
      instapay_identifier: instapaySelected ? extras.instapay_identifier.trim() : "",
      instapay_recipient: instapaySelected ? extras.instapay_recipient.trim() : "",
      vodafone_identifier: vodafoneSelected ? extras.vodafone_identifier.trim() : "",
      vodafone_recipient: vodafoneSelected ? extras.vodafone_recipient.trim() : "",
    };

    if (!submittedName || submittedName.length > 100) { setMessage("اكتب اسمًا من 1 إلى 100 حرف."); return; }
    if (submittedDescription.length > 180) { setMessage("الوصف لازم يكون 180 حرف أو أقل."); return; }
    if (enabledLinks.length > 12) { setMessage("الحد الأقصى 12 رابطًا."); return; }
    for (const link of enabledLinks) {
      if (!link.label.trim() || link.label.trim().length > 50) { setMessage("اكتب اسمًا لكل زر، بحد أقصى 50 حرفًا."); return; }
      try { if (new URL(link.destination_url).protocol !== "https:") throw new Error(); }
      catch { setMessage("كل رابط لازم يكون كاملًا ويبدأ بـ https://"); return; }
    }
    if (savedExtras.show_save_contact && !savedExtras.contact_phone && !savedExtras.contact_email) {
      setMessage("أضف هاتفًا أو بريدًا قبل تفعيل حفظ جهة الاتصال."); return;
    }
    if ((instapaySelected && (!savedExtras.instapay_identifier || !savedExtras.instapay_recipient))
      || (vodafoneSelected && (!savedExtras.vodafone_identifier || !savedExtras.vodafone_recipient))) {
      setMessage("اكتب اسم المستلم وبيانات وسيلة الدفع المختارة."); return;
    }
    if (published && enabledLinks.filter((link) => link.is_enabled).length === 0
      && !savedExtras.contact_phone && !savedExtras.contact_email
      && !savedExtras.instapay_identifier && !savedExtras.vodafone_identifier) {
      setMessage("أضف رابطًا أو وسيلة تواصل أو دفع قبل النشر."); return;
    }
    for (const file of [avatarFile, coverFile]) {
      if (file?.size && (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
        setMessage("الصور المقبولة JPG أو PNG أو WebP، حتى 5 ميجابايت."); return;
      }
    }

    startTransition(async () => {
      setMessage("");
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) { setMessage("سجّل الدخول مرة تانية ثم حاول."); return; }

      let savedPageId = pageId;
      if (!savedPageId) {
        const { data, error } = await supabase.rpc("save_merchant_page", {
          p_page_id: null, p_display_name: submittedName, p_short_description: submittedDescription,
          p_avatar_path: null, p_cover_path: null, p_is_published: false, p_links: [],
        });
        if (error || typeof data !== "string") { setMessage("تعذر إنشاء الصفحة. تأكد من تشغيل قاعدة البيانات المحلية وتحديثها."); return; }
        savedPageId = data;
        setPageId(data);
      }

      const uploadedPaths: string[] = [];
      const uploadImage = async (file: File | null, kind: "avatar" | "cover", currentPath: string | null) => {
        if (!file?.size) return { path: currentPath, error: null as string | null };
        const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
        const path = `${authData.user.id}/${savedPageId}/${kind}-${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from("merchant-assets").upload(path, file, { contentType: file.type, upsert: false });
        if (!error) uploadedPaths.push(path);
        return { path: error ? currentPath : path, error: error?.message ?? null };
      };

      const [avatarResult, coverResult] = await Promise.all([
        uploadImage(avatarFile, "avatar", page?.avatar_path ?? null),
        uploadImage(coverFile, "cover", page?.cover_path ?? null),
      ]);
      if (avatarResult.error || coverResult.error) {
        if (uploadedPaths.length) await supabase.storage.from("merchant-assets").remove(uploadedPaths).catch(() => {});
        setMessage("تعذر رفع الصورة. تقدر تحفظ الصفحة بدون صورة أو تحاول تاني.");
        return;
      }

      const { error } = await supabase.rpc("save_merchant_page_experience", {
        p_page_id: savedPageId,
        p_display_name: submittedName,
        p_short_description: submittedDescription,
        p_avatar_path: avatarResult.path,
        p_cover_path: coverResult.path,
        p_is_published: published,
        p_links: enabledLinks.map((link) => ({
          id: link.id, label: link.label.trim(), destination_url: link.destination_url.trim(), is_enabled: link.is_enabled, icon_key: link.icon_key,
        })),
        p_extras: savedExtras,
      });
      if (error) {
        if (uploadedPaths.length) await supabase.storage.from("merchant-assets").remove(uploadedPaths).catch(() => {});
        setMessage(error.message.includes("Publish") ? "أضف رابطًا مفعّلًا قبل النشر." : "تعذر حفظ الصفحة. راجع الروابط وحاول تاني.");
        return;
      }
      try { sessionStorage.removeItem(draftKey); } catch { /* Saving works even when tab storage is blocked. */ }
      setDirty(false);
      setDraftNotice(false);
      const currentPaths = [page?.avatar_path, page?.cover_path].filter((path): path is string => Boolean(path));
      const retainedPaths = new Set([avatarResult.path, coverResult.path].filter((path): path is string => Boolean(path)));
      const replacedPaths = currentPaths.filter((path) => !retainedPaths.has(path));
      if (replacedPaths.length) await supabase.storage.from("merchant-assets").remove(replacedPaths).catch(() => {});
      setMessage("تم حفظ صفحة الهبوط.");
      router.push("/dashboard/pages");
      router.refresh();
    });
  }

  return <form className={styles.pageEditor} onSubmit={save}>
    <div className={styles.editorHeading}><div><p className={styles.eyebrow}>{tr("صفحة العميل")}</p><h1>{page ? tr("عدّل صفحة الهبوط") : tr("أنشئ صفحة هبوط")}</h1><p>{tr("رتّب معلوماتك وروابطك. تقدر تربط الصفحة بقطعة واحدة أو أكتر.")}</p></div><Link href="/dashboard/pages">{tr("رجوع للصفحات")}</Link></div>
    {draftNotice && <p className={styles.editorHint} role="status">{tr("احتفظنا بالنص والروابط عند تغيير اللغة. أعد اختيار أي صورة كنت قد حددتها قبل التبديل.")}</p>}
    <fieldset className={styles.editorControls} data-testid="page-editor-controls" disabled={!draftReady || pending}>
    <div className={styles.editorLayout}><div className={styles.editorFields}>
      <label>{tr("اسم النشاط")}<input name="displayName" dir="auto" required maxLength={100} value={displayName} onChange={(event) => { setDisplayName(event.target.value); setDirty(true); }} placeholder={tr("مثال: كافيه كليكو")} /></label>
      <label>{tr("نبذة قصيرة")}<textarea name="shortDescription" dir="auto" maxLength={180} rows={3} value={shortDescription} onChange={(event) => { setShortDescription(event.target.value); setDirty(true); }} placeholder={tr("عرّف الزائر بنشاطك في سطرين")} /></label>
      <div className={styles.imageInputs}>
        <label>{tr("صورة الحساب")}<input name="avatar" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setAvatarPreview(URL.createObjectURL(file)); setDirty(true); } }} /></label>
        <label>{tr("صورة الغلاف")}<input name="cover" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setCoverPreview(URL.createObjectURL(file)); setDirty(true); } }} /></label>
      </div>
      <section className={styles.servicePicker} aria-label={tr("اختار خدمات صفحتك")}>
        <h3>{tr("اختار خدمات صفحتك")}</h3>
        <p>{tr("علّم على اللي عايز يظهر للزوار، وبعدها أضف الرابط أو البيانات.")}</p>
        <div className={styles.serviceOptions}>
          {serviceChoices.map((choice) => <label key={choice.key}>
            <input type="checkbox" checked={links.some((link) => link.icon_key === choice.key)}
              disabled={links.length >= 12 && !links.some((link) => link.icon_key === choice.key)}
              onChange={(event) => toggleService(choice.key, choice.label, event.target.checked)} />
            <ServiceIcon name={choice.key} /> <span>{choice.label}</span>
          </label>)}
          <label><input type="checkbox" checked={contactSelected} onChange={(event) => { setDirty(true); setContactSelected(event.target.checked); }} /><ServiceIcon name="phone" /> <span>{tr("تواصل")}</span></label>
          <label><input type="checkbox" checked={instapaySelected} onChange={(event) => { setDirty(true); setInstapaySelected(event.target.checked); }} /><ServiceIcon name="instapay" /> <span>InstaPay</span></label>
          <label><input type="checkbox" checked={vodafoneSelected} onChange={(event) => { setDirty(true); setVodafoneSelected(event.target.checked); }} /><ServiceIcon name="vodafone" /> <span>Vodafone Cash</span></label>
        </div>
      </section>
      {contactSelected && <section className={styles.extraFields}>
        <h3>{tr("بيانات التواصل")}</h3>
        <label>{tr("الاسم في جهة الاتصال")}<input value={extras.contact_name} maxLength={100} onChange={(event) => editExtra("contact_name", event.target.value)} placeholder={displayName || tr("اسم النشاط")} /></label>
        <label>{tr("رقم الهاتف")}<input value={extras.contact_phone} type="tel" maxLength={25} dir="ltr" onChange={(event) => editExtra("contact_phone", event.target.value)} placeholder="+20" /></label>
        <label>{tr("البريد الإلكتروني")}<input value={extras.contact_email} type="email" maxLength={254} dir="ltr" onChange={(event) => editExtra("contact_email", event.target.value)} placeholder="name@example.com" /></label>
        <label>{tr("الموقع في جهة الاتصال")}<input value={extras.contact_website} type="url" dir="ltr" onChange={(event) => editExtra("contact_website", event.target.value)} placeholder="https://" /></label>
        <label className={styles.featureCheckbox}><input type="checkbox" checked={extras.show_save_contact} onChange={(event) => editExtra("show_save_contact", event.target.checked)} />{tr("أظهر زر حفظ جهة الاتصال")}</label>
      </section>}
      {instapaySelected && <section className={styles.extraFields}><h3>InstaPay</h3>
        <label>{tr("اسم المستلم")}<input value={extras.instapay_recipient} maxLength={100} onChange={(event) => editExtra("instapay_recipient", event.target.value)} /></label>
        <label>{tr("عنوان أو رقم InstaPay")}<input value={extras.instapay_identifier} maxLength={64} dir="ltr" onChange={(event) => editExtra("instapay_identifier", event.target.value)} /></label>
      </section>}
      {vodafoneSelected && <section className={styles.extraFields}><h3>Vodafone Cash</h3>
        <label>{tr("اسم المستلم")}<input value={extras.vodafone_recipient} maxLength={100} onChange={(event) => editExtra("vodafone_recipient", event.target.value)} /></label>
        <label>{tr("رقم Vodafone Cash")}<input value={extras.vodafone_identifier} maxLength={64} dir="ltr" onChange={(event) => editExtra("vodafone_identifier", event.target.value)} /></label>
      </section>}
      <div className={styles.linksHeading}><div><h3>{tr("روابط الصفحة")}</h3><p>{tr("رتّب الأزرار واخفِ أي زر مش عايز يظهر.")}</p></div><button type="button" disabled={links.length >= 12} onClick={() => { setDirty(true); setLinks((current) => [...current, { id: null, label: "", destination_url: "", is_enabled: true, icon_key: "link" }]); }}>{tr("+ أضف رابطًا مخصصًا")}</button></div>
      <div className={styles.editorLinks}>{links.map((link, index) => <fieldset key={link.id ?? `new-${index}`} className={styles.linkEditor}>
        <legend><ServiceIcon name={link.icon_key} size={15} /> {tr("رابط")} {index + 1}</legend>
        <label>{tr("اسم الزر")}<input dir="auto" value={link.label} maxLength={50} onChange={(event) => editLink(index, { label: event.target.value })} placeholder="Instagram" /></label>
        <label>{tr("الرابط")}<input value={link.destination_url} type="url" dir="ltr" onChange={(event) => editLink(index, { destination_url: event.target.value })} placeholder="https://instagram.com/" /></label>
        <div className={styles.linkTools}><label><input type="checkbox" checked={link.is_enabled} onChange={(event) => editLink(index, { is_enabled: event.target.checked })} />  {tr("ظاهر للزوار")}</label><button type="button" onClick={() => moveLink(index, -1)} disabled={index === 0}>↑</button><button type="button" onClick={() => moveLink(index, 1)} disabled={index === links.length - 1}>↓</button><button type="button" onClick={() => { setDirty(true); setLinks((current) => current.filter((_, i) => i !== index)); }}>{tr("حذف")}</button></div>
      </fieldset>)}</div>
      <label className={styles.publishToggle}><input type="checkbox" checked={published} onChange={(event) => { setPublished(event.target.checked); setDirty(true); }} />  {tr("انشر الصفحة الآن")}</label>
      <p className={styles.editorHint}>{tr("الصفحة المنشورة تظهر للزوار من خلال QR/NFC لقطعة مرتبطة بها. لا يمكن فتحها من قطعة غير مفعّلة.")}</p>
      <div className={styles.editorActions}><button type="submit" disabled={pending}>{pending ? tr("جاري الحفظ…") : published ? tr("احفظ وانشر") : tr("احفظ كمسودة")}</button>{message && <p role="status">{tr(message)}</p>}</div>
    </div><aside className={styles.pagePreview}><p>{tr("معاينة مباشرة")}</p><div className={styles.previewPhone}>
      <div className={styles.previewCover} style={coverPreview ? { backgroundImage: `url(${coverPreview})` } : undefined} />
      {avatarPreview ? <img className={styles.previewAvatar} src={avatarPreview} alt="" /> : <div className={styles.previewAvatarPlaceholder}>C</div>}
      <h3 dir="auto">{displayName.trim() || tr("اسم النشاط")}</h3><p dir="auto">{shortDescription.trim() || tr("نبذة قصيرة عن نشاطك تظهر هنا")}</p>
      <div className={styles.previewActions}>{links.filter((link) => link.is_enabled && link.label.trim()).map((link, index) => <span key={link.id ?? `preview-${index}`} dir="auto"><ServiceIcon name={link.icon_key} size={16}/>{link.label}</span>)}
        {contactSelected && extras.contact_phone && <span><ServiceIcon name="phone" size={16}/>{tr("اتصل بنا")}</span>}
        {contactSelected && extras.contact_email && <span><ServiceIcon name="email" size={16}/>{tr("راسلنا")}</span>}
        {contactSelected && extras.show_save_contact && <span><ServiceIcon name="save-contact" size={16}/>{tr("احفظ جهة الاتصال")}</span>}
        {instapaySelected && extras.instapay_identifier && <span><ServiceIcon name="instapay" size={16}/>InstaPay</span>}
        {vodafoneSelected && extras.vodafone_identifier && <span><ServiceIcon name="vodafone" size={16}/>Vodafone Cash</span>}
        <span><ServiceIcon name="share" size={16}/>{tr("شارك الصفحة")}</span>
      </div>
      <small>CliQo · One Click .. You’re There</small>
    </div></aside></div>
    </fieldset>
  </form>;
}
