"use client";
import { useCopy } from '@/i18n/client';


import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "../dashboard.module.css";

type PageLink = { id: string | null; label: string; destination_url: string; is_enabled: boolean };
type PageData = {
  id: string; display_name: string; short_description: string; avatar_path: string | null;
  cover_path: string | null; is_published: boolean;
  links: PageLink[];
  avatar_url?: string | null; cover_url?: string | null;
};

export function PageEditor({ page }: { page: PageData | null }) {
  const tr = useCopy();

  const router = useRouter();
  const supabase = createClient();
  const [pageId, setPageId] = useState(page?.id ?? null);
  const [links, setLinks] = useState<PageLink[]>(page?.links ?? []);
  const [published, setPublished] = useState(page?.is_published ?? false);
  const [displayName, setDisplayName] = useState(page?.display_name ?? "");
  const [shortDescription, setShortDescription] = useState(page?.short_description ?? "");
  const [avatarPreview, setAvatarPreview] = useState(page?.avatar_url ?? null);
  const [coverPreview, setCoverPreview] = useState(page?.cover_url ?? null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => () => {
    if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
    if (coverPreview?.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
  }, [avatarPreview, coverPreview]);

  function editLink(index: number, changes: Partial<PageLink>) {
    setLinks((current) => current.map((link, i) => i === index ? { ...link, ...changes } : link));
  }

  function moveLink(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= links.length) return;
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
    const enabledLinks = links.filter((link) => link.label.trim() || link.destination_url.trim());

    if (!submittedName || submittedName.length > 100) { setMessage("اكتب اسمًا من 1 إلى 100 حرف."); return; }
    if (submittedDescription.length > 180) { setMessage("الوصف لازم يكون 180 حرف أو أقل."); return; }
    if (enabledLinks.length > 12) { setMessage("الحد الأقصى 12 رابطًا."); return; }
    for (const link of enabledLinks) {
      if (!link.label.trim() || link.label.trim().length > 50) { setMessage("اكتب اسمًا لكل زر، بحد أقصى 50 حرفًا."); return; }
      try { if (new URL(link.destination_url).protocol !== "https:") throw new Error(); }
      catch { setMessage("كل رابط لازم يكون كاملًا ويبدأ بـ https://"); return; }
    }
    if (published && enabledLinks.filter((link) => link.is_enabled).length === 0) {
      setMessage("أضف رابطًا واحدًا مفعّلًا على الأقل قبل النشر."); return;
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

      const { error } = await supabase.rpc("save_merchant_page", {
        p_page_id: savedPageId,
        p_display_name: submittedName,
        p_short_description: submittedDescription,
        p_avatar_path: avatarResult.path,
        p_cover_path: coverResult.path,
        p_is_published: published,
        p_links: enabledLinks.map((link) => ({
          id: link.id, label: link.label.trim(), destination_url: link.destination_url.trim(), is_enabled: link.is_enabled,
        })),
      });
      if (error) {
        if (uploadedPaths.length) await supabase.storage.from("merchant-assets").remove(uploadedPaths).catch(() => {});
        setMessage(error.message.includes("Publish") ? "أضف رابطًا مفعّلًا قبل النشر." : "تعذر حفظ الصفحة. راجع الروابط وحاول تاني.");
        return;
      }
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
    <div className={styles.editorLayout}><div className={styles.editorFields}>
      <label>{tr("اسم النشاط")}<input name="displayName" dir="auto" required maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={tr("مثال: كافيه كليكو")} /></label>
      <label>{tr("نبذة قصيرة")}<textarea name="shortDescription" dir="auto" maxLength={180} rows={3} value={shortDescription} onChange={(event) => setShortDescription(event.target.value)} placeholder={tr("عرّف الزائر بنشاطك في سطرين")} /></label>
      <div className={styles.imageInputs}>
        <label>{tr("صورة الحساب")}<input name="avatar" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) setAvatarPreview(URL.createObjectURL(file)); }} /></label>
        <label>{tr("صورة الغلاف")}<input name="cover" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) setCoverPreview(URL.createObjectURL(file)); }} /></label>
      </div>
      <div className={styles.linksHeading}><div><h3>{tr("روابط الصفحة")}</h3><p>{tr("كل ضغطة تتسجل في إحصائيات القطعة.")}</p></div><button type="button" disabled={links.length >= 12} onClick={() => setLinks((current) => [...current, { id: null, label: "", destination_url: "", is_enabled: true }])}>{tr("+ أضف رابطًا")}</button></div>
      <div className={styles.editorLinks}>{links.map((link, index) => <fieldset key={link.id ?? `new-${index}`} className={styles.linkEditor}>
        <legend>{tr("رابط")} {index + 1}</legend>
        <label>{tr("اسم الزر")}<input dir="auto" value={link.label} maxLength={50} onChange={(event) => editLink(index, { label: event.target.value })} placeholder="Instagram" /></label>
        <label>{tr("الرابط")}<input value={link.destination_url} type="url" dir="ltr" onChange={(event) => editLink(index, { destination_url: event.target.value })} placeholder="https://instagram.com/" /></label>
        <div className={styles.linkTools}><label><input type="checkbox" checked={link.is_enabled} onChange={(event) => editLink(index, { is_enabled: event.target.checked })} />  {tr("ظاهر للزوار")}</label><button type="button" onClick={() => moveLink(index, -1)} disabled={index === 0}>↑</button><button type="button" onClick={() => moveLink(index, 1)} disabled={index === links.length - 1}>↓</button><button type="button" onClick={() => setLinks((current) => current.filter((_, i) => i !== index))}>{tr("حذف")}</button></div>
      </fieldset>)}</div>
      <label className={styles.publishToggle}><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />  {tr("انشر الصفحة الآن")}</label>
      <p className={styles.editorHint}>{tr("الصفحة المنشورة تظهر للزوار من خلال QR/NFC لقطعة مرتبطة بها. لا يمكن فتحها من قطعة غير مفعّلة.")}</p>
      <div className={styles.editorActions}><button type="submit" disabled={pending}>{pending ? tr("جاري الحفظ…") : published ? tr("احفظ وانشر") : tr("احفظ كمسودة")}</button>{message && <p role="status">{tr(message)}</p>}</div>
    </div><aside className={styles.pagePreview}><p>{tr("معاينة مباشرة")}</p><div className={styles.previewPhone}>
      <div className={styles.previewCover} style={coverPreview ? { backgroundImage: `url(${coverPreview})` } : undefined} />
      {avatarPreview ? <img className={styles.previewAvatar} src={avatarPreview} alt="" /> : <div className={styles.previewAvatarPlaceholder}>C</div>}
      <h3 dir="auto">{displayName.trim() || tr("اسم النشاط")}</h3><p dir="auto">{shortDescription.trim() || tr("نبذة قصيرة عن نشاطك تظهر هنا")}</p>
      <div className={styles.previewActions}>{links.filter((link) => link.is_enabled && link.label.trim()).map((link, index) => <span key={link.id ?? `preview-${index}`} dir="auto">{link.label}</span>)}</div>
      <small>CliQo · One Click .. You’re There</small>
    </div></aside></div>
  </form>;
}
