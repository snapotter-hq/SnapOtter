---
description: "ثبّت SnapOtter باستخدام Docker بأمر واحد. يشمل إعداد Docker Compose، والبناء من المصدر، ونظرة عامة كاملة على الميزات."
i18n_output_hash: 83a518bd23e4
i18n_source_hash: 24724b5595b2
i18n_provenance: human
---

# البدء {#getting-started}

::: tip جرّب قبل التثبيت
استكشف الواجهة الكاملة على [demo.snapotter.com](https://demo.snapotter.com) - دون الحاجة إلى تسجيل أو تثبيت.
:::

## بداية سريعة {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

تشغّل هذه الحاوية الواحدة كل ما تحتاجه: مع عدم تعيين `DATABASE_URL`، تبدأ PostgreSQL و Redis الخاصين بها على واجهة الاسترجاع (الوضع المدمج) وتحتفظ بجميع البيانات في وحدة التخزين `SnapOtter-data`. إنها أسرع طريقة لتجربة SnapOtter أو الاستضافة الذاتية على مختبر منزلي. لبيئة الإنتاج، شغّل حزمة [Docker Compose](#docker-compose) أدناه، التي تبقي PostgreSQL و Redis في حاوياتهما الخاصة. يعمل الوضع المدمج كـ root (الافتراضي) ويتوقف تلقائيًا بمجرد تعيينك لـ `DATABASE_URL`.

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

يتطلب [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). يرجع إلى المعالج المركزي تلقائيًا عندما يكون CUDA غير متاح. تسريع iGPU من Intel/AMD عبر VA-API أو Quick Sync أو OpenCL غير مدعوم لاستدلال الذكاء الاصطناعي حاليًا. راجع [وسوم Docker](/ar/guide/docker-tags) لاختبارات الأداء.
:::

::: details متوفر أيضًا على GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

ينشر كلا السجلين نفس الصورة عند كل إصدار.
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

راجع [التهيئة](/ar/guide/configuration) لجميع متغيرات البيئة.

## البناء من المصدر {#build-from-source}

**المتطلبات المسبقة:** Node.js 22+، و pnpm 9+، و Docker (لـ Postgres + Redis)، و Python 3.10+ (لميزات الذكاء الاصطناعي)، و Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- الواجهة الأمامية: [http://localhost:1349](http://localhost:1349)
- الواجهة الخلفية: [http://localhost:13490](http://localhost:13490)

## ما يمكنك فعله {#what-you-can-do}

### معالجة الملفات (200+ أداة) {#file-processing-200-tools}

| الوسيط | العدد | أمثلة على الأدوات |
|----------|-------|---------------|
| **الصور** | 105 | تغيير الحجم، والاقتصاص، والضغط، والتحويل، وإزالة الخلفية، وتكبير الدقة، و OCR، والعلامة المائية، والملصقة، والتلوين، وأدوات GIF، وإعدادات التنسيق المسبقة |
| **الفيديو** | 57 | القص، والاقتصاص، والضغط، والتحويل، والدمج، واستخراج الصوت، والترجمات التلقائية، والفيديو إلى GIF، وتغيير الحجم، والتثبيت، وإعدادات التنسيق المسبقة |
| **الصوت** | 27 | القص، والدمج، والتحويل، والتسوية، وتقليل الضوضاء، والنسخ النصي، وتحويل درجة النغمة، والتلاشي، وصانع نغمات الرنين، وإعدادات التنسيق المسبقة |
| **PDF / المستندات** | 42 | الدمج، والتقسيم، والضغط، و OCR، والعلامة المائية، والتنقيح، و Word إلى PDF، و Excel إلى PDF، والتدوير، والحماية، والإصلاح |
| **الملفات** | 10 | CSV إلى JSON، و JSON إلى XML، ودمج ملفات CSV، وتقسيم CSV، وإنشاء ZIP، واستخراج ZIP، وصانع المخططات، و YAML/JSON |

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
