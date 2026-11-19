---
description: "ثبّت SnapOtter باستخدام Docker بأمر واحد، وسجّل الدخول، وافتح أول أداة. يشمل تسريع GPU والأجهزة الصغيرة وDocker Compose والبناء من المصدر."
i18n_source_hash: c2aae540add0
i18n_provenance: machine
i18n_output_hash: 5c4276eae47c
i18n_hash_version: 2
---

# البدء {#getting-started}

::: tip جرّب قبل التثبيت
استكشف الواجهة الكاملة على [demo.snapotter.com](https://demo.snapotter.com) دون الحاجة إلى تسجيل أو تثبيت.
:::

## البدء السريع {#quick-start}

شغّل أمراً واحداً:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

ثم افتح [http://localhost:1349](http://localhost:1349) وسجّل الدخول باستخدام `admin` / `admin`. ستُطالَب بتغيير كلمة المرور عند أول تسجيل دخول.

الآن افتح أداة. اختر واحدة من الشريط الجانبي، أو انتقل مباشرة إلى [تغيير الحجم](http://localhost:1349/image/resize)، وأفلت صورة، ونزّل النتيجة.

هذا هو التثبيت كله. تشغّل هذه الحاوية الواحدة كل ما تحتاج إليه: عند عدم ضبط `DATABASE_URL`، تبدأ PostgreSQL وRedis الخاصتين بها على واجهة loopback (الوضع المضمَّن) وتحفظ جميع البيانات في وحدة التخزين `SnapOtter-data`. وهي أسرع طريقة لتجربة SnapOtter أو استضافته ذاتياً على خادم منزلي. يعمل الوضع المضمَّن بصلاحيات root (الافتراضي) ويتوقف تلقائياً بمجرد ضبط `DATABASE_URL`. للإنتاج، استخدم [حزمة Docker Compose](#docker-compose) التي تُبقي PostgreSQL وRedis في حاويتيهما الخاصتين.

لا تُحفظ نتائج المهام في وحدة تخزين البيانات، لذا تختفي عند استبدال الحاوية (عند ترقية الصورة مثلًا) وتتوقف روابط تنزيلها عن العمل. يشرح قسم [الاحتفاظ بمخرجات المهام](/ar/guide/deployment#keeping-job-output) في دليل النشر كيفية الاحتفاظ بها.

::: tip التشغيل على 4 GB من الذاكرة أو أقل
على Raspberry Pi أو حاسوب محمول قديم أو VPS صغير، شغّل مهمة واحدة في كل مرة وحدّد حجم مجموعة خيوط الصور بإضافة `-e CONCURRENT_JOBS=1 -e MAX_WORKER_THREADS=2` إلى الأمر أعلاه، وتجنّب حزم الذكاء الاصطناعي الثقيلة. يعرض [الإعدادات منخفضة الموارد](/ar/guide/low-resource#tuning-knobs) الحدود الأخرى التي يستحسن ضبطها وما يمكن توقعه من العتاد المحدود.
:::

::: tip التحليلات المجهولة للمنتج
يتضمن SnapOtter تحليلات مجهولة للمنتج افتراضياً. لإيقافها، افتح **Settings → System → Privacy** وأوقف **Anonymous Product Analytics**. تتوقف فوراً على مستوى النسخة بالكامل.

يمكنك أيضاً ضبط متغير البيئة `SNAPOTTER_TELEMETRY=0` (ويعمل `false` و`off` أيضاً) لتعطيل كل القياس عن بُعد للنسخة دون إعادة بناء.

تعتمد مراقبة الأخطاء على [Sentry](https://sentry.io)، التي ترعى SnapOtter عبر برنامجها للمصادر المفتوحة.

للاطلاع على تفاصيل ما يُجمع، راجع [ما الذي يجمعه SnapOtter](/ar/guide/telemetry).
:::

## تسريع GPU {#gpu-acceleration}

تجعل وحدة NVIDIA GPU أدوات الذكاء الاصطناعي الثقيلة أسرع بكثير: التكبير (نحو 47 مرة)، وتحسين الوجوه (نحو 12 مرة)، والتفريغ النصي، وإزالة الخلفية (نحو 4 مرات لكل منهما). أما OCR وكشف الوجوه واستعادة الصور فتبقى معتمدة على CPU، ولا يفيدها GPU. الصورة نفسها تخدم الحالتين؛ أضف `--gpus all`:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

يتطلب هذا [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) على المضيف. وعند غياب CUDA يعود SnapOtter تلقائياً إلى CPU. تسريع وحدات iGPU من Intel/AMD عبر VA-API أو Quick Sync أو OpenCL غير مدعوم حالياً في استدلال الذكاء الاصطناعي.

- يعرض [متطلبات العتاد](/ar/guide/deployment#full-ai-tools-on-nvidia-cuda) توقيتات GPU وCPU كاملة، و[مقاييس صورة Docker](/ar/guide/docker-tags#benchmarks) أرقام التشغيل الدافئ والبارد.
- إذا كانت أدوات الذكاء الاصطناعي ما زالت تعمل على CPU، فراجع [التحقق من تسريع GPU](/ar/guide/deployment#verify-gpu-acceleration).
- لاستخدام Compose، راجع [البدء السريع مع NVIDIA CUDA](/ar/guide/deployment#quick-start-nvidia-cuda) في دليل النشر.

## طرق تثبيت أخرى {#other-ways-to-install}

### حاوية واحدة مع Compose {#single-container-compose}

هي حاوية الوضع المضمَّن نفسها الواردة في البدء السريع، لكنها مكتوبة بصيغة ملف Compose ليسهل تتبعها وتعديلها. احفظها باسم `docker-compose.yml` ثم شغّل `docker compose up -d`:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace  # keeps job results across upgrades
    environment:
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin  # you're asked to change it on first login
    restart: unless-stopped
    # mem_limit: 4g
    # cpus: 2

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
```

مثل أمر `docker run`، هذا مخصص لتجربة SnapOtter وللتثبيتات الصغيرة. كل إعداد في [الإعدادات](/ar/guide/configuration) يوضع تحت `environment`.

### Docker Compose (للإنتاج) {#docker-compose}

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

افتح [http://localhost:1349](http://localhost:1349) وسجّل الدخول باستخدام `admin` / `admin`.

يتضمن [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) المعتمد جميع وحدات التخزين الأربع الخاصة بالتشغيل، وفحوص السلامة، وحدود الموارد، وإعداد Redis الدائم، وصور قاعدة البيانات/الذاكرة المؤقتة المثبَّتة، وتحصين الحاوية الحالي. غيّر كلمة مرور المسؤول الافتراضية فور تسجيل الدخول الأول. للحصول على نشر قابل لإعادة الإنتاج، ثبّت صورة تطبيق SnapOtter على وسم الإصدار أو digest الذي تحققت منه بدلاً من اتباع `latest`.

راجع [الإعدادات](/ar/guide/configuration) لجميع متغيرات البيئة، و[الأمان والتحصين](/ar/guide/security) للأسرار وسياسة الشبكة وإرشادات النسخ الاحتياطي.

### GitHub Container Registry {#ghcr}

يُنشر كل من Docker Hub وGHCR الصورة نفسها مع كل إصدار. للسحب من GHCR، بدّل اسم الصورة:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

### البناء من المصدر {#build-from-source}

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
| **فيديو** | 59 | القص الزمني، الاقتصاص، الضغط، التحويل، الدمج، استخراج الصوت، الترجمة التلقائية، فيديو إلى GIF، تغيير الحجم، التثبيت، إعدادات مسبقة للصيغ |
| **صوت** | 27 | القص الزمني، الدمج، التحويل، التسوية، تقليل الضوضاء، التفريغ النصي، تغيير النغمة، التلاشي، صانع النغمات، إعدادات مسبقة للصيغ |
| **PDF / مستندات** | 36 | الدمج، التقسيم، الضغط، OCR، العلامة المائية، التنقيح، Word إلى PDF، Excel إلى PDF، التدوير، الحماية، الإصلاح |
| **ملفات** | 25 | CSV إلى JSON، JSON إلى XML، دمج ملفات CSV، تقسيم CSV، إنشاء ZIP، استخراج ZIP، صانع المخططات، YAML/JSON |

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