# CliQo website


<!-- CLIQO-BRAND-UPDATE -->
> **ألوان الموقع — 11 نوفمبر 2026:** **CliQo | كليكو** · **One Click .. You’re There**<br>
> الألوان: Black `#000000` · Orange `#FB6221` · Charcoal `#1E1E1E` · Light Gray `#D1D2D5`. الخطوط: ITC Avant Garde Gothic Pro Bold + Forma DJR Arabic Deck Medium.<br>
> ألوان واجهة الموقع الحالية من لوحة 11 نوفمبر؛ تتقدم على ألوان المراجع الأقدم. الاسم والشعار باقيان كما هما. [مرجع الهوية الحالي](../output/cliqo-brand-identity/BRAND-GUIDELINES.md). أسماء الملفات والمسارات والأكواد والنطاقات القديمة لا تعني إعادة تسميتها أو امتلاك نطاق جديد.
<!-- /CLIQO-BRAND-UPDATE -->

تطبيق الموقع الجاري بناؤه: Next.js App Router + TypeScript + Tailwind CSS، طبقًا لـ`../tech-stack.md`. الواجهة ولوحة العميل ومسار QR/NFC كلها داخل التطبيق. لا يوجد ملف HTML مستقل مستخدم لتشغيل الموقع. النموذج القديم محفوظ خارج مجلد `website` في `../output/archive/website-prototype-v1/`.

## تشغيل الواجهة محليًا

```sh
npm install
npm run dev
```

افتح http://localhost:4173. صفحات المتجر تعمل، ولوحة إدارة المشروع على `/admin/orders` و`/admin/customers` و`/admin/inventory` تحتاج Supabase المحلي وحساب المالك.

## Supabase محلي

إعداد CLI محفوظ في `supabase/config.toml`. يلزم Docker أو Podman متوافق قبل تشغيل الستاك. بعد تشغيله:

```sh
npx supabase start
npx supabase status -o json | node -e 'let data = ""; process.stdin.on("data", chunk => data += chunk).on("end", () => { const status = JSON.parse(data); process.stdout.write(`NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY}\n`); })' > .env.local
```

أضف سطر `CLIQO_DATABASE_URL` من `.env.example` إلى `.env.local` بعد توليد الملف، ثم شغّل `npm run dev`. اتصال Postgres يستخدمه الخادم فقط لإنشاء الطلبات وحركات المخزون. بيانات Auth المحلية ورسائل البريد تبقى محلية. migration النشطة تحت `supabase/migrations/`؛ مسودة الستاند القديمة محفوظة في `supabase/legacy/` ولا تُطبق.

حساب Google المحلي الوحيد مربوط حاليًا بدور **مالك CliQo `owner`**. للدخول افتح `/login?next=/admin/orders` واستخدم OTP المحلي المجرب. Google OAuth مضبوط محليًا، لكن اكتمال الرجوع من Google لم يُختبر بعد. لرسائل OTP المحلية افتح Mailpit على `http://127.0.0.1:54334`. عند إنشاء بيئة جديدة، سجّل حساب المالك أولًا ثم اربطه مرة واحدة بدور `owner` من SQL Editor في Supabase Studio على `http://127.0.0.1:54333`:

```sql
insert into public.staff_members (user_id, display_name, role)
select id, 'CliQo Owner', 'owner' from auth.users where email = 'you@example.com'
on conflict (user_id) do nothing;
```

لا يحصل أي حساب جديد على صلاحية الإدارة تلقائيًا. إضافة مدير آخر مؤجلة إلى حين الحاجة لها، ولا يحصل على دور `owner`.

## حالة التنفيذ

- المتجر يعرض العائلات الست؛ زر الشراء يظهر فقط لنسخة معتمدة لها مخزون، وبعد فتح البيع والشحن في قاعدة البيانات.
- Checkout ضيف ومسار COD جاهزان محليًا ومقفولان افتراضيًا. تكامل Paymob المستضاف، إشعار HMAC، حماية تكرار الإشعار، وحالة الدفع وإعادة المحاولة جاهزة برمجيًا؛ الربط والحساب والاختبار الخارجي لم تكتمل. رفع ملفات Custom يعمل عبر صفحة متابعة الطلب.
- تأكيد أوردر COD من لوحة المالك يحجز الكمية، وإلغاؤه يحررها، وتجهيزه للشحن يصرفها. إضافة مخزون معتمَد تسجل حركة تدقيق.
- لوحة المالك تقرأ سجلات Supabase المحلية وتحفظ حالة الطلب والبند والملاحظات. متابعة الأوردر محمية بـcookie خاص للجهاز الذي أنشأه.
- Supabase المحلي يعمل عبر Docker Desktop على المنافذ `54331–54339`؛ المنافذ الافتراضية مستخدمة من مشروع آخر ولم نوقفه. migration طُبقت، `db lint` وفحوص صلاحيات وسجل التدقيق نجحت. لم يُربط مشروع سحابي.
- `.env.local` يحتوي إعدادات Supabase العامة واتصال Postgres محلي للخادم فقط باسم `CLIQO_DATABASE_URL`. لا يدخل مفتاح `service_role` أو اتصال القاعدة إلى المتصفح.
- لا يوجد SKU أو أوردر فعلي مُعتمد حتى الآن. البيع يظل مقفولًا حتى اعتماد المنتجات والسياسات والدعم والبريد وربط طريقة الدفع والشحن ورسومه.
- **ممنوع وضع مفاتيح الخدمة في المتصفح.** لا تستخدم هذه الإعدادات المحلية للإنتاج؛ راجع `Plan.md` لكل بوابات الإطلاق.

## واجهات Stitch

تم تطبيق اتجاه CliQo في شاشات الرئيسية، الكتالوج، السلة، إتمام الطلب، طريقة الاستخدام ولوحة العميل. صور المنتجات المنقولة من مشروع Stitch تصورات بصرية وليست عينات معتمدة أو QR جاهزًا للاستخدام؛ لذلك تظهر بعلامة «تصور بصري». التوافر والأسعار والطلب تأتي من Supabase المحلي وشروط اعتماد SKU والشحن، وإحصائيات لوحة العميل تعرض بيانات الحساب الفعلية فقط.


## تحديث اللغتين والرئيسية — 27 أكتوبر 2026

الموقع كله يدعم العربية RTL والإنجليزية LTR بواسطة `next-intl`، بنفس المسارات. زر اللغة يحفظ الاختيار سنة في Cookie باسم `cliqo-locale`؛ العربية افتراضية. الكتالوج والحالات ورسائل الواجهات مترجمة، بينما محتوى العملاء يظل كما كتبوه. الخطوط محلية من `Fonts/`، ولا توجد خدمة ترجمة خارجية أثناء تشغيل الموقع.

الرئيسية تعرض الاستخدامات، معاينة تفاعلية، المنتجات الستة، التحكم من الحساب، مسارات التصميم والأسئلة الشائعة. حواف الواجهات مشتركة، وQR يحتفظ بشكله ومساحة أمانه. الأسعار والمخزون وبوابات البيع وصلاحيات الحسابات وروابط `/s/` لم تتغير.

```sh
npm test
CLIQO_DIST_DIR=.next-verification npm run build
CLIQO_DIST_DIR=.next-verification npx next start -p 4174
# في نافذة أخرى، مع Google Chrome مثبت:
npm run test:e2e
# فحص الحسابات واللوحات والصلاحيات؛ يعمل محليًا فقط وينظف بياناته المؤقتة:
node tests/auth-local.e2e.mjs
```

فحص المتصفح يحفظ صور الكمبيوتر والموبايل باللغتين في `../output/cliqo-bilingual-review/`. لتغيير عنوان نسخة الاختبار، استخدم `CLIQO_TEST_URL`. بيانات اختبارات الحسابات تبقى في Supabase المحلي؛ لا تُشغّلها ضد الإنتاج.
