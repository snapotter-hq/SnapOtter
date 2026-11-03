---
description: "ثبّت SnapOtter باستخدام Docker بأمر واحد. يشمل إعداد Docker Compose، والبناء من المصدر، ونظرة عامة كاملة على الميزات."
i18n_source_hash: aa8428189808
i18n_provenance: machine
i18n_output_hash: 8cfb48c1f68f
i18n_hash_version: 2
---

# البدء {#getting-started}

::: tip جرّب قبل التثبيت
استكشف الواجهة الكاملة على [demo.snapotter.com](https://demo.snapotter.com) دون الحاجة إلى تسجيل أو تثبيت.
:::

## البدء السريع {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

تشغّل هذه الحاوية الواحدة كل ما تحتاج إليه: عند عدم ضبط `DATABASE_URL`، تبدأ PostgreSQL وRedis الخاصتين بها على واجهة loopback (الوضع المضمَّن) وتحفظ جميع البيانات في وحدة التخزين `SnapOtter-data`. وهي أسرع طريقة لتجربة SnapOtter أو استضافته ذاتياً على خادم منزلي. للإنتاج، استخدم [حزمة Docker Compose المعتمدة](#docker-compose) التي تُبقي PostgreSQL وRedis في حاويتيهما الخاصتين. يعمل الوضع المضمَّن بصلاحيات root (الافتراضي) ويتوقف تلقائياً بمجرد ضبط `DATABASE_URL`.

هل تثبّت على Raspberry Pi أو حاسوب محمول قديم أو VPS صغير؟ راجع [الإعدادات منخفضة الموارد](/ar/guide/low-resource) للحصول على شرح مضبوط وما يمكن توقعه من العتاد المحدود.

ستُطالَب بتغيير كلمة المرور عند أول تسجيل دخول.

::: tip التحليلات المجهولة للمنتج
يتضمن SnapOtter تحليلات مجهولة للمنتج افتراضياً. لإيقافها، افتح **Settings → System → Privacy** وأوقف **Anonymous Product Analytics**. تتوقف فوراً على مستوى النسخة بالكامل.

يمكنك أيضاً ضبط متغير البيئة `SNAPOTTER_TELEMETRY=0` (ويعمل `false` و`off` أيضاً) لتعطيل كل القياس عن بُعد للنسخة دون إعادة بناء.

تعتمد مراقبة الأخطاء على [Sentry](https://sentry.io)، التي ترعى SnapOtter عبر برنامجها للمصادر المفتوحة.

للاطلاع على تفاصيل ما يُجمع، راجع [ما الذي يجمعه SnapOtter](/ar/guide/telemetry).
:::

::: tip تسريع NVIDIA CUDA
أضف `--gpus all` لإزالة الخلفية وتكبير الصور وتحسين الوجوه والاستعادة بتسريع NVIDIA CUDA. يبقى OCR معتمداً على وحدة المعالجة المركزية ويعمل في الصورة نفسها سواء توفر الوصول إلى GPU أم لا:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

يتطلب [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). يعود تلقائياً إلى وحدة المعالجة المركزية عند عدم توفر CUDA. تسريع وحدات iGPU من Intel/AMD عبر VA-API أو Quick Sync أو OpenCL غير مدعوم حالياً في استدلال الذكاء الاصطناعي. راجع [وسوم Docker](/ar/guide/docker-tags) لمقاييس الأداء. إذا كانت أدوات الذكاء الاصطناعي تعمل على وحدة المعالجة المركزية رغم `--gpus all`، فراجع [التحقق من تسريع GPU](/ar/guide/deployment#verify-gpu-acceleration).
:::

::: details متوفرة أيضاً على GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

يُنشر السجلان الصورة نفسها مع كل إصدار.
:::

## Docker Compose {#docker-compose}

استخدم ملف الإنتاج الذي يُصان ويُختبر مع كل إصدار بدلاً من نسخ مثال Compose مختصر من هذه الصفحة:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

يتضمن [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) المعتمد جميع وحدات التخزين الأربع الخاصة بالتشغيل، وفحوص السلامة، وحدود الموارد، وإعداد Redis الدائم، وصور قاعدة البيانات/الذاكرة المؤقتة المثبَّتة، وتحصين الحاوية الحالي. غيّر كلمة مرور المسؤول الافتراضية فور تسجيل الدخول الأول. للحصول على نشر قابل لإعادة الإنتاج، ثبّت صورة تطبيق SnapOtter على وسم الإصدار أو digest الذي تحققت منه بدلاً من اتباع `latest`.

راجع [الإعدادات](/ar/guide/configuration) لجميع متغيرات البيئة، و[الأمان والتحصين](/ar/guide/security) للأسرار وسياسة الشبكة وإرشادات النسخ الاحتياطي.

## البناء من المصدر {#build-from-source}

**المتطلبات:** Node.js 22.22+ وpnpm 9+ وDocker (لـ Postgres وRedis) وPython 3.11+ (لميزات الذكاء الاصطناعي) وGit.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- الواجهة الأمامية: [http://localhost:1351](http://localhost:1351)
- الواجهة الخلفية: [http://localhost:13490](http://localhost:13490)

## ما الذي يمكنك فعله {#what-you-can-do}

### معالجة الملفات (200+ أداة) {#file-processing-200-tools}

| النوع | العدد | أمثلة على الأدوات |
|----------|-------|---------------|
| **صور** | 112 | تغيير الحجم، القص، الضغط، التحويل، إزالة الخلفية، التكبير، OCR، العلامة المائية، الكولاج، التلوين، أدوات GIF، إعدادات مسبقة للصيغ |
| **فيديو** | 57 | القص الزمني، الاقتصاص، الضغط، التحويل، الدمج، استخراج الصوت، الترجمة التلقائية، فيديو إلى GIF، تغيير الحجم، التثبيت، إعدادات مسبقة للصيغ |
| **صوت** | 27 | القص الزمني، الدمج، التحويل، التسوية، تقليل الضوضاء، التفريغ النصي، تغيير النغمة، التلاشي، صانع النغمات، إعدادات مسبقة للصيغ |
| **PDF / مستندات** | 35 | الدمج، التقسيم، الضغط، OCR، العلامة المائية، التنقيح، Word إلى PDF، Excel إلى PDF، التدوير، الحماية، الإصلاح |
| **ملفات** | 23 | CSV إلى JSON، JSON إلى XML، دمج ملفات CSV، تقسيم CSV، إنشاء ZIP، استخراج ZIP، صانع المخططات، YAML/JSON |

### خطوط المعالجة (Pipelines) {#pipelines}

اربط الأدوات في سير عمل متعدد الخطوات وطبّقه على صورة واحدة أو على دفعة كاملة:

1. افتح **Pipelines** في الشريط الجانبي.
2. أضف الخطوات (أي أداة، وأي إعدادات).
3. شغّل على ملف واحد، أو على دفعة كاملة دفعة واحدة.
4. احفظ خط المعالجة لإعادة استخدامه لاحقاً.

تسمح خطوط المعالجة بـ 20 خطوة افتراضياً. اضبط `MAX_PIPELINE_STEPS=0` لجعل الحد غير محدود.

### مكتبة الملفات {#file-library}

يمكن حفظ كل ملف تعالجه في مكتبة **Files** لديك. يتتبع SnapOtter سجل الإصدارات الكامل بحيث يمكنك تتبع كل خطوة معالجة من الرفع الأصلي إلى المخرج النهائي.

الحفظ صريح: النتائج التي تحفظها في المكتبة تبقى حتى تحذفها، أما النتائج التي تعالجها وتتركها دون حفظ فتُمسح تلقائياً بعد 72 ساعة (قابلة للضبط عبر `FILE_MAX_AGE_HOURS`).

### REST API ومفاتيح API {#rest-api-api-keys}

كل أداة متاحة عبر HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

أنشئ مفاتيح API من **Settings → API Keys**. راجع [مرجع REST API](/ar/api/rest) لجميع نقاط النهاية، أو زر [http://localhost:1349/api/docs](http://localhost:1349/api/docs) للاطلاع على المرجع التفاعلي.

### تعدد المستخدمين والفرق {#multi-user-teams}

فعّل تعدد المستخدمين مع التحكم في الوصول حسب الأدوار:

- **المسؤول (Admin)**: وصول كامل، إدارة المستخدمين والفرق والإعدادات وجميع الملفات وخطوط المعالجة ومفاتيح API
- **المستخدم (User)**: استخدام الأدوات وإدارة ملفاته وخطوط معالجته ومفاتيح API الخاصة به

أنشئ الفرق من **Settings → Teams** لتجميع المستخدمين.

اضبط `AUTH_ENABLED=true` (أو `false` للاستخدام الفردي/الذاتي دون تسجيل دخول).

## استخدمه من هاتفك {#use-it-from-your-phone}

يعمل SnapOtter في متصفحات الجوال، ويمكنك تثبيته كتطبيق. افتح نسختك على الهاتف، ثم:

- **iPhone / iPad (Safari):** اضغط على مشاركة، ثم **Add to Home Screen**.
- **Android (Chrome):** افتح قائمة المتصفح واضغط على **Install app**.

يُفتح التطبيق المثبَّت في نافذته الخاصة، مباشرة على نسختك.

تنبيه واحد: لا تعرض المتصفحات مطالبة التثبيت إلا عبر HTTPS. أما عنوان HTTP عادي على شبكتك المحلية فيعمل جيداً في علامة تبويب المتصفح؛ وللتثبيت الفعلي، ضع النسخة خلف وكيل عكسي مع شهادة (راجع [دليل النشر](/ar/guide/deployment)).

على الهواتف واللوحيات، تعرض أدوات الصور زر **Take photo** بجوار زر الرفع. صوّر إيصالاً أو سبورة فتصل مباشرة إلى الأداة.