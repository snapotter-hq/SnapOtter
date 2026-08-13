---
description: "ثبّت SnapOtter باستخدام Docker بأمر واحد. يشمل إعداد Docker Compose، والبناء من المصدر، ونظرة عامة كاملة على الميزات."
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: e8421f9b57be
i18n_hash_version: 2
---

# البدء {#getting-started}

::: tip جرّب قبل التثبيت
استكشف الواجهة الكاملة على [demo.snapotter.com](https://demo.snapotter.com) - دون الحاجة إلى تسجيل أو تثبيت.
:::

## بداية سريعة {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

تعمل هذه الحاوية الفردية على تشغيل كل ما تحتاجه: بدون تعيين `DATABASE_URL`، فإنها تبدأ تشغيل PostgreSQL وRedis الخاصين بها على واجهة الاسترجاع (الوضع المضمن) وتحتفظ بجميع البيانات في وحدة تخزين `SnapOtter-data`. إنها أسرع طريقة لتجربة SnapOtter أو الاستضافة الذاتية على معمل منزلي. للإنتاج، استخدم [مكدس Docker Compose الأساسي](#docker-compose)، الذي يحتفظ بـ PostgreSQL وRedis في حاوياتهما الخاصة. يعمل الوضع المضمن كجذر (الافتراضي) ويتم إيقاف تشغيله تلقائيًا بمجرد ضبط `DATABASE_URL`.

هل تثبّت على Raspberry Pi أو حاسوب محمول قديم أو VPS صغير؟ راجع [التشغيل على موارد محدودة](/ar/guide/low-resource) للاطلاع على شرح تطبيقي مضبوط وما يمكن توقعه من العتاد المحدود.

سيُطلب منك تغيير كلمة مرورك عند أول تسجيل دخول.

::: tip تحليلات المنتج المجهولة
يتضمن SnapOtter تحليلات منتج مجهولة افتراضيًا. لإيقافها، افتح **Settings → System → Privacy** وأطفئ **Anonymous Product Analytics**. تتوقف فورًا للنسخة بأكملها.

يمكنك أيضًا تعيين متغير البيئة `SNAPOTTER_TELEMETRY=0` (يعمل `false` و `off` أيضًا) لتعطيل كل القياس عن بُعد للنسخة دون إعادة بناء.

مراقبة الأخطاء مدعومة بـ [Sentry](https://sentry.io)، الذي يرعى SnapOtter عبر برنامجه مفتوح المصدر.

للاطلاع على تفاصيل ما يُجمع، راجع [ما يجمعه SnapOtter](/ar/guide/telemetry).
:::

::: tip تسريع NVIDIA CUDA
أضف `--gpus all` لإزالة الخلفية المتسارعة بواسطة NVIDIA CUDA، ورفع مستوى الصوت، وتحسين الوجه، واستعادته. يظل OCR قائمًا على وحدة المعالجة المركزية (CPU) ويعمل بنفس الصورة مع أو بدون الوصول إلى GPU:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

يتطلب [مجموعة أدوات حاوية NVIDIA](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). يعود إلى وحدة المعالجة المركزية تلقائيًا عندما لا يكون CUDA متاحًا. تسريع Intel/AMD iGPU من خلال VA-API أو Quick Sync أو OpenCL غير مدعوم لاستدلال الذكاء الاصطناعي اليوم. راجع [علامات Docker](/ar/guide/docker-tags) لمعرفة المعايير. إذا كانت أدوات الذكاء الاصطناعي تعمل على وحدة المعالجة المركزية بالرغم من `--gpus all`، فراجع [التحقق من تسريع وحدة معالجة الرسومات](/ar/guide/deployment#verify-gpu-acceleration).
:::

::: details متوفر أيضًا على GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

ينشر كلا السجلين نفس الصورة عند كل إصدار.
:::

## دوكر يؤلف {#docker-compose}

استخدم ملف الإنتاج الذي تمت صيانته واختباره مع كل إصدار بدلاً من نسخ مثال الإنشاء المختصر من هذه الصفحة:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.2.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

يتضمن [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.2.0/docker/docker-compose.yml) الأساسي جميع وحدات تخزين وقت التشغيل الأربعة، وفحوصات السلامة، وحدود الموارد، وتكوين Redis الدائم، وصور قاعدة البيانات/ذاكرة التخزين المؤقت المثبتة، وتصلب الحاوية الحالية. قم بتغيير كلمة مرور المسؤول الافتراضية مباشرة بعد تسجيل الدخول الأول. للحصول على نشر قابل للتكرار، قم بتثبيت صورة تطبيق SnapOtter على علامة الإصدار أو الملخص الذي قمت بالتحقق منه بدلاً من اتباع `latest`.

راجع [التكوين](/ar/guide/configuration) للتعرف على كافة متغيرات البيئة و[الأمان والصلابة](/ar/guide/security) للتعرف على الأسرار وسياسة الشبكة وإرشادات النسخ الاحتياطي.

## البناء من المصدر {#build-from-source}

**المتطلبات المسبقة:** Node.js 22.22+، و pnpm 9+، و Docker (لـ Postgres + Redis)، و Python 3.11+ (لميزات الذكاء الاصطناعي)، و Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- الواجهة الأمامية: [http://localhost:1351](http://localhost:1351)
- الواجهة الخلفية: [http://localhost:13490](http://localhost:13490)

## ما يمكنك فعله {#what-you-can-do}

### معالجة الملفات (200+ أداة) {#file-processing-200-tools}

| الوسيط | العدد | أمثلة على الأدوات |
|----------|-------|---------------|
| **الصور** | 107 | تغيير الحجم، والاقتصاص، والضغط، والتحويل، وإزالة الخلفية، وتكبير الدقة، و OCR، والعلامة المائية، والملصقة، والتلوين، وأدوات GIF، وإعدادات التنسيق المسبقة |
| **الفيديو** | 57 | القص، والاقتصاص، والضغط، والتحويل، والدمج، واستخراج الصوت، والترجمات التلقائية، والفيديو إلى GIF، وتغيير الحجم، والتثبيت، وإعدادات التنسيق المسبقة |
| **الصوت** | 27 | القص، والدمج، والتحويل، والتسوية، وتقليل الضوضاء، والنسخ النصي، وتحويل درجة النغمة، والتلاشي، وصانع نغمات الرنين، وإعدادات التنسيق المسبقة |
| **PDF / المستندات** | 29 | الدمج، والتقسيم، والضغط، و OCR، والعلامة المائية، والتنقيح، و Word إلى PDF، و Excel إلى PDF، والتدوير، والحماية، والإصلاح |
| **الملفات** | 23 | CSV إلى JSON، و JSON إلى XML، ودمج ملفات CSV، وتقسيم CSV، وإنشاء ZIP، واستخراج ZIP، وصانع المخططات، و YAML/JSON |

### خطوط الأنابيب {#pipelines}

اربط الأدوات في سير عمل متعدد الخطوات وطبّقها على صورة واحدة أو دفعة كاملة:

1. افتح **Pipelines** في الشريط الجانبي.
2. أضف خطوات (أي أداة، وأي إعدادات).
3. شغّل على ملف واحد - أو دفعة كاملة دفعة واحدة.
4. احفظ خط الأنابيب لإعادة استخدامه لاحقًا.

تسمح خطوط الأنابيب بـ 20 خطوة افتراضيًا. عيّن `MAX_PIPELINE_STEPS=0` لجعل الحد غير محدود.

### مكتبة الملفات {#file-library}

يمكن حفظ كل ملف تعالجه في مكتبة **Files** الخاصة بك. يتتبع SnapOtter سجل الإصدارات الكامل حتى تتمكن من تتبع كل خطوة معالجة من عملية الرفع الأصلية إلى الإخراج النهائي.

الحفظ صريح: تُحفظ النتائج التي تحفظها في المكتبة حتى تحذفها، بينما تُمحى النتائج التي تعالجها وتتركها غير محفوظة تلقائيًا بعد 72 ساعة (قابلة للتهيئة عبر `FILE_MAX_AGE_HOURS`).

### REST API ومفاتيح API {#rest-api-api-keys}

كل أداة قابلة للوصول عبر HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

أنشئ مفاتيح API ضمن **Settings → API Keys**. راجع [مرجع REST API](/ar/api/rest) لجميع النقاط الطرفية، أو زُر [http://localhost:1349/api/docs](http://localhost:1349/api/docs) للمرجع التفاعلي.

### متعدد المستخدمين والفِرق {#multi-user-teams}

فعّل عدة مستخدمين مع التحكم في الوصول المستند إلى الأدوار:

- **المسؤول**: وصول كامل - إدارة المستخدمين، والفِرق، والإعدادات، وجميع الملفات/خطوط الأنابيب/مفاتيح API
- **المستخدم**: استخدام الأدوات، وإدارة ملفاته/خطوط أنابيبه/مفاتيح API الخاصة به

أنشئ فِرقًا ضمن **Settings → Teams** لتجميع المستخدمين.

عيّن `AUTH_ENABLED=true` (أو `false` للمستخدم الواحد/الاستخدام الذاتي دون تسجيل دخول).

## الاستخدام من هاتفك {#use-it-from-your-phone}

يعمل SnapOtter في متصفحات الجوال، ويمكنك تثبيته كتطبيق. افتح نسختك على الهاتف، ثم:

- **iPhone / iPad (Safari)**: اضغط على مشاركة، ثم **إضافة إلى الشاشة الرئيسية**.
- **Android (Chrome)**: افتح قائمة المتصفح واضغط على **تثبيت التطبيق**.

يفتح التطبيق المثبَّت في نافذة خاصة به، مباشرةً إلى نسختك.

ملاحظة واحدة: لا تعرض المتصفحات خيار التثبيت إلا عبر HTTPS. عنوان HTTP عادي على شبكتك المحلية يظل يعمل جيدًا في علامة تبويب المتصفح؛ أما للتثبيت الفعلي، فضع النسخة خلف وكيل عكسي مع شهادة (راجع [دليل النشر](/ar/guide/deployment)).

على الهواتف والأجهزة اللوحية، تعرض أدوات الصور زر **التقاط صورة** بجوار زر التحميل. صوِّر إيصالًا أو سبورة بيضاء لتصل الصورة مباشرة إلى الأداة.
