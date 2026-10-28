# CliQo: تجهيز النشر على VPS

هذه الملفات تجهز **تطبيق Next.js فقط**. قاعدة البيانات وAuth وStorage تعمل عبر نسخة Supabase الرسمية المستضافة ذاتيًا، على نفس الخادم وشبكة Docker خاصة. تجهيز الملفات لا يعني أن الموقع منشور أو أن البيع مفتوح.

## قبل التشغيل

1. تأكيد موارد VPS الفعلية ثم قياس استهلاك Supabase والتطبيق معًا. إرشاد Supabase الرسمي يوصي بـ4 أنوية و8GB RAM و80GB تخزين للتركيب الكامل؛ لا نفترض أن KVM2 سيكفي للحمل الحقيقي قبل الاختبار.
2. امتلاك نطاق نهائي للموقع وآخر للـAPI، وضبط HTTPS من reverse proxy. اربط `NEXT_PUBLIC_SITE_URL` بنطاق الموقع، و`NEXT_PUBLIC_SUPABASE_URL` بنطاق API. لا تطبع QR بيع قبل ثبات النطاق.
3. تثبيت نسخة محددة من [Supabase Docker self-host](https://supabase.com/docs/guides/self-hosting/docker) في مجلد منفصل، وضبط أسرارها وعناوين Auth والبريد وGoogle OAuth وفق [إرشاد HTTPS](https://supabase.com/docs/guides/self-hosting/self-hosted-proxy-https). لا تستخدم Supabase CLI المحلية كخدمة إنتاج.
4. اجعل Postgres وStorage وخدمات الإدارة على شبكة خاصة؛ افتح للعامة HTTPS فقط. راجع منافذ Supabase Docker الفعلية قبل تشغيله. استخدم جدار حماية ونسخًا احتياطيًا خارج الخادم وتنبيهات توقف.
5. طبّق migrations من `supabase/migrations` على قاعدة إنتاج جديدة، ثم افحص RLS والمفاتيح والدور المالك بحسابات اختبار. لا تنقل بيانات التطوير إلى الإنتاج.

## التطبيق

انسخ `app.env.example` إلى `app.env` داخل `deploy/` على الخادم، واملأه بقيم الإنتاج. الملف الحقيقي مستبعد من Git وDocker build context. استخدم اسم خدمة قاعدة البيانات داخل شبكة Supabase في `CLIQO_DATABASE_URL`. لا تضع كلمة مرور Postgres في URL عام أو في متغيرات `NEXT_PUBLIC_*`. ثبّت صلاحيات `app.env` لمالك الخدمة فقط.

من مجلد `website`:

```sh
docker compose --env-file deploy/app.env -f deploy/app.compose.yaml config --quiet
docker compose --env-file deploy/app.env -f deploy/app.compose.yaml up -d --build
curl -fsS http://127.0.0.1:3000/api/health
```

`CLIQO_SUPABASE_NETWORK` يجب أن يطابق اسم شبكة Docker الحقيقية للتركيب الرسمي. التطبيق متاح على loopback فقط؛ reverse proxy يتولى HTTPS أمامه. ملاحظة: قيم `NEXT_PUBLIC_*` تدخل حزمة المتصفح وقت البناء؛ بعد تغيير نطاق أو مفتاح عام أعد بناء الصورة. أسرار Postgres وSupabase تعمل وقت التشغيل فقط.

## ما قبل استقبال عملاء

- جهّز SMTP مرسلًا من نطاق CliQo، واختبر OTP وروابط Google OAuth على نطاق الإنتاج من البداية للنهاية.
- خذ نسخة احتياطية دورية مشفرة من Postgres وملفات Storage خارج VPS، واختبر استرجاعها فعليًا. تحديث Supabase وحده لا يصنع نسخة احتياطية.
- اختبر `/api/health` من مراقبة خارجية، وانقطاع قاعدة البيانات، وسجلات التطبيق والخدمات. الرد 200 يعني أن التطبيق يتصل بقاعدة البيانات؛ 503 يعني عطلًا يحتاج تدخلًا.
- جرّب QR مطبوعًا على النطاق النهائي، ونموذج NFC Custom ونموذج Template على iPhone وAndroid، ثم اختبر الإيقاف والتعديل والإحصائيات.
- أبقِ Checkout مغلقًا حتى اعتماد السعر والعينة والسياسات، بوابة الكارت، COD، ورسوم الشحن وشركة الشحن.

المصادر: [Supabase self-hosting](https://supabase.com/docs/guides/self-hosting)، [Docker setup](https://supabase.com/docs/guides/self-hosting/docker)، [تحديث النسخة المستضافة ذاتيًا](https://supabase.com/docs/guides/self-hosting/updating)، [Next.js standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).
