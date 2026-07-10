---
description: "ثبّت SnapOtter باستخدام Docker بأمر واحد. يشمل إعداد Docker Compose، والبناء من المصدر، ونظرة عامة كاملة على الميزات."
i18n_source_hash: d2366a2e051c
i18n_provenance: human
i18n_output_hash: dbf2635de8dd
---

# البدء {#getting-started}

::: tip جرّب قبل التثبيت
استكشف واجهة المستخدم الكاملة على [demo.snapotter.com](https://demo.snapotter.com) - لا حاجة إلى تسجيل أو تثبيت.
:::

## بداية سريعة {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

تشغّل هذه الحاوية الواحدة كل ما تحتاج إليه: من دون ضبط `DATABASE_URL`، تبدأ تشغيل PostgreSQL وRedis الخاصين بها على واجهة loopback (الوضع المضمَّن) وتحتفظ بجميع البيانات في وحدة التخزين `SnapOtter-data`. إنها أسرع طريقة لتجربة SnapOtter أو الاستضافة الذاتية على مختبر منزلي. للإنتاج، شغّل حزمة [Docker Compose](#docker-compose) أدناه، التي تُبقي PostgreSQL وRedis في حاويتيهما الخاصتين. يعمل الوضع المضمَّن كمستخدم جذر (الوضع الافتراضي) ويتوقف تلقائيًا بمجرد ضبط `DATABASE_URL`.

سيُطلب منك تغيير كلمة المرور عند أول تسجيل دخول.

::: tip تحليلات المنتج المجهّلة
تتضمن SnapOtter تحليلات منتج مجهّلة افتراضيًا. لإيقافها، افتح **الإعدادات ← النظام ← الخصوصية** وأوقف **تحليلات المنتج المجهّلة**. تتوقف فورًا للنسخة بأكملها.

لمعرفة تفاصيل ما يُجمَع، راجع [ما تجمعه SnapOtter](/ar/guide/telemetry).
:::

::: tip تسريع NVIDIA CUDA
أضف `--gpus all` لإزالة الخلفية والتكبير وOCR وتحسين الوجه والاستعادة بتسريع NVIDIA CUDA:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

يتطلب [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). يعود إلى وحدة المعالجة المركزية تلقائيًا عندما تكون CUDA غير متاحة. تسريع معالج الرسومات المدمج من Intel/AMD عبر VA-API أو Quick Sync أو OpenCL غير مدعوم لاستدلال الذكاء الاصطناعي حاليًا. راجع [علامات Docker](/ar/guide/docker-tags) لمقاييس الأداء.
:::

::: details متاح أيضًا على GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

ينشر كلا السجلَّين الصورة نفسها في كل إصدار.
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

راجع [الإعداد](/ar/guide/configuration) لجميع متغيرات البيئة.

## البناء من المصدر {#build-from-source}

**المتطلبات الأساسية:** Node.js 22+، وpnpm 9+، وDocker (لـ Postgres + Redis)، وPython 3.10+ (لميزات الذكاء الاصطناعي)، وGit.

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

### معالجة الملفات (241 أداة) {#file-processing-241-tools}

| النمط | العدد | أمثلة على الأدوات |
|----------|-------|---------------|
| **الصور** | 105 | تغيير الحجم، القص، الضغط، التحويل، إزالة الخلفية، التكبير، OCR، العلامة المائية، الكولاج، التلوين، أدوات GIF، إعدادات الصيغ المسبقة |
| **الفيديو** | 57 | القص، الاقتصاص، الضغط، التحويل، الدمج، استخراج الصوت، الترجمات التلقائية، فيديو إلى GIF، تغيير الحجم، التثبيت، إعدادات الصيغ المسبقة |
| **الصوت** | 27 | القص، الدمج، التحويل، التسوية، تقليل الضوضاء، التفريغ النصي، إزاحة النغمة، التلاشي، صانع نغمات الرنين، إعدادات الصيغ المسبقة |
| **PDF / المستندات** | 42 | الدمج، التقسيم، الضغط، OCR، العلامة المائية، التنقيح، Word إلى PDF، Excel إلى PDF، التدوير، الحماية، الإصلاح |
| **الملفات** | 10 | CSV إلى JSON، JSON إلى XML، دمج ملفات CSV، تقسيم CSV، إنشاء ZIP، استخراج ZIP، صانع المخططات، YAML/JSON |

### خطوط الأنابيب {#pipelines}

اربط الأدوات في سير عمل متعدد الخطوات وطبّقها على صورة واحدة أو دفعة كاملة:

1. افتح **خطوط الأنابيب** في الشريط الجانبي.
2. أضف خطوات (أي أداة، أي إعدادات).
3. شغّلها على ملف واحد - أو دفعة كاملة دفعةً واحدة.
4. احفظ خط الأنابيب لإعادة استخدامه لاحقًا.

تسمح خطوط الأنابيب بـ 20 خطوة افتراضيًا. اضبط `MAX_PIPELINE_STEPS=0` لجعل الحد غير محدود.

### مكتبة الملفات {#file-library}

يمكن حفظ كل ملف تعالجه في مكتبة **الملفات** الخاصة بك. تتتبع SnapOtter سجل الإصدارات الكامل بحيث يمكنك تتبع كل خطوة معالجة من التحميل الأصلي إلى الناتج النهائي.

الحفظ صريح: النتائج التي تحفظها في المكتبة تبقى حتى تحذفها، بينما النتائج التي تعالجها وتتركها غير محفوظة تُمسَح تلقائيًا بعد 72 ساعة (قابلة للضبط عبر `FILE_MAX_AGE_HOURS`).

### REST API ومفاتيح API {#rest-api-api-keys}

كل أداة متاحة عبر HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

أنشئ مفاتيح API ضمن **الإعدادات ← مفاتيح API**. راجع [مرجع REST API](/ar/api/rest) لجميع نقاط النهاية، أو تفضّل بزيارة [http://localhost:1349/api/docs](http://localhost:1349/api/docs) للمرجع التفاعلي.

### المستخدمون المتعددون والفرق {#multi-user-teams}

فعّل مستخدمين متعددين مع التحكم في الوصول القائم على الأدوار:

- **المسؤول**: وصول كامل - إدارة المستخدمين والفرق والإعدادات وجميع الملفات وخطوط الأنابيب ومفاتيح API
- **المستخدم**: استخدام الأدوات وإدارة ملفاته وخطوط أنابيبه ومفاتيح API الخاصة به

أنشئ فرقًا ضمن **الإعدادات ← الفرق** لتجميع المستخدمين.

اضبط `AUTH_ENABLED=true` (أو `false` للاستخدام الفردي/الذاتي من دون تسجيل دخول).
