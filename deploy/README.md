# CliQo: تجهيز النشر على VPS

هذه الملفات تجهز **تطبيق Next.js**، ومعها وصفة نشر Supabase الرسمية ذاتيًا على نفس الخادم. التطبيق وSupabase يتصلان عبر شبكة Docker خاصة. تجهيز الملفات لا يعني أن البيع مفتوح.

## قبل التشغيل

1. تأكيد موارد VPS الفعلية ثم قياس استهلاك Supabase والتطبيق معًا. صفحة Hostinger تعرض حاليًا KVM2 بـ2 vCPU و8GB RAM و100GB NVMe، وKVM4 بـ4 vCPU و16GB RAM و200GB NVMe؛ راجع تفاصيل الشراء وقتها لأنها تتغير. Supabase يذكر حدًا أدنى 2 نواة و4GB RAM و40GB SSD، ويوصي بـ4 أنوية و8GB+ و80GB+ **لتشغيل Supabase**. بذلك KVM2 يطابق الحد الأدنى، لكنه أقل من توصية الأنوية، كما أن Next.js سيشاركه الموارد. ابدأ بـKVM2 كما تقرر، واختبر الحمل والذاكرة والتخزين تحت سيناريو استخدام متوقع قبل الإطلاق؛ انتقل لخطة أكبر إذا كشف الاختبار اختناقًا. [موارد Supabase الرسمية](https://supabase.com/docs/guides/self-hosting/docker#system-requirements) · [خطط Hostinger VPS](https://www.hostinger.com/vps-hosting?lang=en).
2. النطاق الإنتاجي المعتمد هو `cliqoeg.com` وAPI على `api.cliqoeg.com`. `deploy/Caddyfile` يوجّه الموقع إلى التطبيق ويتيح مسارات Supabase المطلوبة فقط؛ بقية مسارات API غير متاحة للعامة. لا تطبع QR بيع قبل ثبات النطاق.
3. تثبيت نسخة محددة من [Supabase Docker self-host](https://supabase.com/docs/guides/self-hosting/docker) في مجلد منفصل، وضبط أسرارها وعناوين Auth والبريد وGoogle OAuth وفق [إرشاد HTTPS](https://supabase.com/docs/guides/self-hosting/self-hosted-proxy-https). لا تستخدم Supabase CLI المحلية كخدمة إنتاج.
4. اجعل Postgres وخدمات الإدارة على شبكة خاصة؛ افتح للعامة 22 و80 و443 فقط. اربط منافذ API وPostgres ولوحة Supabase على loopback، لأن منافذ Docker المنشورة لا يحميها UFW دائمًا. استخدم نسخًا احتياطيًا خارج الخادم وتنبيهات توقف.
5. طبّق migrations من `supabase/migrations` على قاعدة إنتاج جديدة، ثم افحص RLS والمفاتيح والدور المالك بحسابات اختبار. لا تنقل بيانات التطوير إلى الإنتاج.

## التطبيق

انسخ `app.env.example` إلى `app.env` داخل `deploy/` على الخادم، واملأه بقيم الإنتاج. الملف الحقيقي مستبعد من Git وDocker build context. استخدم اسم خدمة قاعدة البيانات داخل شبكة Supabase في `CLIQO_DATABASE_URL`. لا تضع كلمة مرور Postgres في URL عام أو في متغيرات `NEXT_PUBLIC_*`. ثبّت صلاحيات `app.env` لمالك الخدمة فقط.

اضبط `SUPABASE_INTERNAL_URL` على عنوان Kong داخل شبكة Supabase مثل `http://kong:8000`. يستخدمه الخادم وProxy للوصول الداخلي؛ `NEXT_PUBLIC_SUPABASE_URL` يبقى عنوان API العام الذي يصل إليه المتصفح. اسم كوكي الجلسة موحد بين الطرفين كي لا يختلف عند استخدام عنوانين.

## الدفع بالكارت عبر Paymob

الكود يدعم Paymob Hosted Checkout فقط حاليًا. خزّن `PAYMOB_SECRET_KEY` و`PAYMOB_PUBLIC_KEY` و`PAYMOB_HMAC_SECRET` ورقم `PAYMOB_CARD_INTEGRATION_ID` في بيئة الخادم؛ لا تضعها في قاعدة البيانات أو `NEXT_PUBLIC_*`. يحتاج Paymob عنوان `CLIQO_PUBLIC_ORIGIN` عامًا مع HTTPS للوصول إلى `/api/webhooks/paymob?hmac=...`.

اختبار Sandbox عبر بيئة التطوير المحلية يتطلب `PAYMOB_MODE=test` و`CLIQO_ALLOW_PAYMOB_SANDBOX=true` مع عنوان HTTPS مؤقت يصل لتطبيقك. هذا الوضع يعمل خارج `NODE_ENV=production` فقط؛ متغير السماح وحده لا يفعّله في Docker الإنتاجي. استخدم قاعدة البيانات المحلية وبيانات SKU اختبارية، ثم سجل نتيجة اختبارات Sandbox من لوحة `/admin/settings`. اختبار Sandbox المحلي يتجاوز بوابات البيع والشحن والسياسات والبريد فقط، ويظل مشترطًا بقطعة اختبار معتمدة ومخزونها متاحًا. قبل البيع، بدّل إلى مفاتيح الإنتاج، اترك العلم `false`، اختبر الإعداد الحي بموافقة مالك الحساب، ثم سجّل جاهزية البصمة الحية. أي تغيير في المفتاح أو النمط أو رقم التكامل أو النطاق يبطل الجاهزية تلقائيًا. لا تفتح البيع قبل استكمال البوابة والشحن والسياسات والدعم والبريد واعتماد المنتج.

حالة الدفع مصدرها إشعار الخادم الموقع؛ رابط العودة لا يثبت الدفع. الاسترداد الحالي يبدأ يدويًا من لوحة Paymob، ثم يسجل CliQo إشعار الاسترداد الوارد. لا ترسل أسرار Paymob في محادثات أو تذاكر دعم.

من مجلد `website`:

```sh
docker compose --env-file deploy/app.env -f deploy/app.compose.yaml config --quiet
docker compose --env-file deploy/app.env -f deploy/app.compose.yaml up -d --build
curl -fsS http://127.0.0.1:3000/api/health
```

`CLIQO_SUPABASE_NETWORK` يجب أن يطابق اسم شبكة Docker الحقيقية للتركيب الرسمي. التطبيق متاح على loopback فقط؛ reverse proxy يتولى HTTPS أمامه. ملاحظة: قيم `NEXT_PUBLIC_*` تدخل حزمة المتصفح وقت البناء؛ بعد تغيير نطاق أو مفتاح عام أعد بناء الصورة. أسرار Postgres وSupabase تعمل وقت التشغيل فقط.

إعداد Google OAuth للإنتاج يمر عبر `deploy/supabase-compose.override.yaml`: يمرّر `GOOGLE_ENABLED` و`GOOGLE_CLIENT_ID` و`GOOGLE_SECRET` من ملف `.env` الخاص بتركيب Supabase إلى GoTrue، ويستخدم `${API_EXTERNAL_URL}/callback`. يجب أن يكون `API_EXTERNAL_URL=https://api.cliqoeg.com/auth/v1` ليطابق callback المسجل `https://api.cliqoeg.com/auth/v1/callback`. المزوّد مفعّل حاليًا؛ `SITE_URL` هو `https://cliqoeg.com` و`ADDITIONAL_REDIRECT_URLS` يسمحان بعنوان التطبيق `https://cliqoeg.com/auth/callback`. في التطبيق، استخدم `NEXT_PUBLIC_SITE_URL` لوجهة OAuth والـcallback، ولا تستخدم عنوان الربط `0.0.0.0` كعنوان عام. السر الحالي ما زال بحاجة إلى تدوير لاحقًا؛ بعد إضافة سر جديد في Google Console، خزّنه على الخادم فقط ثم أعد إنشاء خدمة `auth` واختبر `/auth/v1/settings` وتسجيل الدخول الكامل. لا تضع بيانات OAuth في `website/deploy/app.env`.

## البريد التشغيلي للطلبات

اضبط متغيرات `CLIQO_SMTP_*` و`CLIQO_EMAIL_FROM*` في `app.env` على مزود SMTP موثّق لنطاق CliQo. أنشئ سرين منفصلين عشوائيين بطول 32 بايت على الأقل: `CLIQO_ORDER_ACCESS_SECRET` لتوقيع روابط متابعة الطلب، و`CLIQO_EMAIL_CRON_SECRET` لحماية عامل الطابور. لا تستخدم قيمة واحدة للاثنين. عنوان الموقع يدخل بصمة الإعداد؛ بعد تغييره أعد اختبار الإرسال من `/admin/settings`.

كل طلب له بريد محفوظ يضيف رسالة إلى طابور خاص داخل قاعدة البيانات في نفس معاملة الطلب. عامل الإرسال يعالج الطابور كل دقيقة، ويعيد المحاولة بتأخير متزايد، ويسجل رمز الخطأ فقط. العامل نفسه يحرر حجز مخزون الدفع بالكارت المنتهي كل دقيقة. الرسائل القديمة تُحذف بعد 90 يومًا. رابط البريد يمنح وصولًا لمدة 30 يومًا لمتابعة الطلب ورفع ملف التصميم أثناء انتظار التصميم؛ يقبل بند الطلب ثلاثة ملفات بحد 5 ميجابايت لكل ملف. اعتبر الرابط سريًا ولا تشاركه. رسائل OTP لحسابات Supabase لها إعداد SMTP مستقل داخل Supabase.

على VPS، ثبّت `cliqo-email-outbox.service` و`cliqo-email-outbox.timer` في `/etc/systemd/system/`، ثم نفّذ `systemctl daemon-reload`. **لا تفعّل المؤقّت قبل نجاح اختبار SMTP الإنتاجي من `/admin/settings`**؛ التطبيق يرد 503 على العامل ما دام اختبار الإعداد غير صالح، وسيؤدي تفعيله حينها إلى فشل متكرر كل دقيقة. بعد نجاح الاختبار فقط نفّذ `systemctl enable --now cliqo-email-outbox.timer`. يشغّل العامل Node داخل حاوية `deploy-web-1`؛ ملف البيئة والسر يظلان في إعداد الحاوية ولا يُنسخان إلى وحدة systemd. يتضمن Dockerfile نسخة العامل في `/app/deploy/email-outbox-runner.mjs`. راقب سجل `cliqo-email-outbox.service` وعدّاد الرسائل المتعثرة في `/admin/settings`. قالب OTP العربي موجود في `supabase/templates/magic_link.html` ويُقدّم داخليًا عبر `deploy/supabase-compose.override.yaml`. محليًا، فعّل `smtp_port` في `supabase/config.toml`؛ الرسائل التجريبية تظهر في Mailpit على `http://127.0.0.1:54334`.

## ما قبل استقبال عملاء

- جهّز SMTP مرسلًا من نطاق CliQo، واختبر رسالة الطلب وروابط متابعتها، ثم OTP وروابط Google OAuth على نطاق الإنتاج من البداية للنهاية.
- خذ نسخة احتياطية دورية مشفرة من Postgres وملفات Storage خارج VPS، واختبر استرجاعها فعليًا وفق [إجراء النسخ والاسترجاع](BACKUP-RESTORE.md). تحديث Supabase وحده لا يصنع نسخة احتياطية.
- اختبر `/api/health` من مراقبة خارجية، وانقطاع قاعدة البيانات، وسجلات التطبيق والخدمات. الرد 200 يعني أن التطبيق يتصل بقاعدة البيانات؛ 503 يعني عطلًا يحتاج تدخلًا.
- جرّب QR مطبوعًا على النطاق النهائي، ونموذج NFC Custom ونموذج Template على iPhone وAndroid، ثم اختبر الإيقاف والتعديل والإحصائيات.
- أبقِ Checkout مغلقًا حتى اعتماد السعر والعينة والسياسات، بوابة الكارت، COD، ورسوم الشحن وشركة الشحن.

المصادر: [Supabase self-hosting](https://supabase.com/docs/guides/self-hosting)، [Docker setup](https://supabase.com/docs/guides/self-hosting/docker)، [تحديث النسخة المستضافة ذاتيًا](https://supabase.com/docs/guides/self-hosting/updating)، [Next.js standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).
