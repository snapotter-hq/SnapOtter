---
description: "جميع متغيّرات بيئة SnapOtter مع قيمها الافتراضية. اضبط المصادقة والتخزين ونماذج الذكاء الاصطناعي والتحليلات وغير ذلك."
i18n_source_hash: 8e9e9ca2840c
i18n_provenance: human
i18n_output_hash: 52883b691606
---

# الإعداد {#configuration}

يتم كل الإعداد عبر متغيّرات البيئة. لكل متغيّر قيمة افتراضية معقولة، لذا يعمل SnapOtter جاهزًا للاستخدام دون ضبط أي منها.

## متغيّرات البيئة {#environment-variables}

### الخادم {#server}

| المتغيّر | الافتراضي | الوصف |
|---|---|---|
| `PORT` | `1349` | المنفذ الذي يستمع عليه الخادم. |
| `RATE_LIMIT_PER_MIN` | `1000` | الحد الأقصى للطلبات في الدقيقة لكل IP. اضبطه على 0 لتعطيل تحديد المعدل. |
| `CORS_ORIGIN` | (فارغ) | المصادر المسموح بها لـ CORS مفصولة بفواصل، أو فارغ للمصدر نفسه فقط. |
| `LOG_LEVEL` | `info` | مستوى تفصيل السجل. أحد: `fatal` أو `error` أو `warn` أو `info` أو `debug` أو `trace`. |
| `TRUST_PROXY` | `true` | ثِق بترويسات `X-Forwarded-For` من وكيل عكسي. اضبطه على `false` إن لم تكن خلف وكيل. |

### المصادقة {#authentication}

| المتغيّر | الافتراضي | الوصف |
|---|---|---|
| `AUTH_ENABLED` | `false` | اضبطه على `true` لطلب تسجيل الدخول. تعتمد صورة Docker الافتراضية `true`. |
| `DEFAULT_USERNAME` | `admin` | اسم المستخدم لحساب المسؤول الأولي. يُستخدم فقط عند التشغيل الأول. |
| `DEFAULT_PASSWORD` | `admin` | كلمة المرور لحساب المسؤول الأولي. غيّرها بعد أول تسجيل دخول. |
| `MAX_USERS` | `0` (غير محدود) | الحد الأقصى لعدد حسابات المستخدمين المسجَّلين. اضبطه على 0 لغير محدود. |
| `SESSION_DURATION_HOURS` | `168` | مدة حياة جلسة تسجيل الدخول بالساعات (الافتراضي 7 أيام). |
| `SKIP_MUST_CHANGE_PASSWORD` | - | اضبطه على أي قيمة غير فارغة لتجاوز مطالبة تغيير كلمة المرور الإجبارية عند أول تسجيل دخول |

### التخزين {#storage}

| المتغيّر | الافتراضي | الوصف |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` أو `s3`. يتطلب S3/MinIO ترخيصًا يتضمن ميزة s3_storage. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@postgres:5432/snapotter` | سلسلة اتصال PostgreSQL. |
| `REDIS_URL` | `redis://redis:6379` | سلسلة اتصال Redis (تُستخدم لطوابير مهام BullMQ). |
| `WORKSPACE_PATH` | `./tmp/workspace` | مجلد الملفات المؤقتة أثناء المعالجة. يُنظَّف تلقائيًا. |
| `FILES_STORAGE_PATH` | `./data/files` | مجلد ملفات المستخدم الدائمة (الصور المرفوعة، والنتائج المحفوظة). |

### الوضع المدمج {#embedded-mode}

شغّل الصورة دون `DATABASE_URL` ودون `REDIS_URL` فتبدأ PostgreSQL 17 وRedis خاصتين بها داخل الحاوية، مقيَّدتين بالحلقة المحلية، مع كل البيانات على وحدة تخزين `/data`. يستعيد هذا تجربة `docker run` بأمر واحد للبدء السريع والمعمل المنزلي والترقيات من الإصدار 1.x. إنه مسار ملائم، لا نشر إنتاجي: للإنتاج، شغّل حزمة Compose من 3 حاويات مع PostgreSQL وRedis منفصلين. يتطلب الوضع المدمج تشغيل الحاوية بصلاحية الجذر وهو غير متوافق مع أنظمة التشغيل بمعرّف مستخدم اعتباطي (OpenShift، وKubernetes `runAsNonRoot`)؛ استخدم Compose هناك.

| المتغيّر | الافتراضي | الوصف |
|---|---|---|
| `EMBEDDED` | `auto` | يُفعَّل تلقائيًا عندما يكون كل من `DATABASE_URL` و`REDIS_URL` غير مضبوطين. اضبطه على `0` لتعطيله (عندئذٍ يفشل التطبيق سريعًا إن لم يُضبط `DATABASE_URL`/`REDIS_URL` خارجي، بدل بدء قاعدة بيانات داخل الحاوية بصمت). |
| `REDIS_MAXMEMORY` | `512mb` | سقف الذاكرة لـ Redis المدمج (الوضع المدمج فقط). اخفضه على المضيفين محدودي الذاكرة مثل Raspberry Pi. |

الترقية من الإصدار 1.x: ضع ملف `snapotter.db` القديم في `/data/snapotter.db` داخل وحدة التخزين ويستورده الوضع المدمج إلى PostgreSQL المدمجة عند الإقلاع الأول. يجري الاستيراد مرة واحدة؛ تتخطّاه عمليات الإقلاع اللاحقة.

ملاحظة عن القياس عن بُعد: يرث الوضع المدمج الإعداد الافتراضي للتحليلات في الصورة مثل أي إعداد آخر. تُشحَن الصورة المنشورة مع تفعيل التحليلات؛ ابنِ بـ `--build-arg SNAPOTTER_ANALYTICS=off`، أو استخدم إلغاء الاشتراك للمسؤول داخل التطبيق، لتعطيلها.

### حدود المعالجة {#processing-limits}

| المتغيّر | الافتراضي | الوصف |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `100` | الحد الأقصى لحجم الملف لكل عملية رفع بالميغابايت. اضبطه على 0 لغير محدود. |
| `MAX_BATCH_SIZE` | `100` | الحد الأقصى لعدد الملفات في طلب دفعي واحد. اضبطه على 0 لغير محدود. |
| `CONCURRENT_JOBS` | `0` (تلقائي) | عدد المهام الدفعية التي تعمل بالتوازي. اضبطه على 0 للاكتشاف التلقائي بناءً على أنوية CPU المتاحة. |
| `MAX_MEGAPIXELS` | `0` (غير محدود) | الحد الأقصى لدقة الصورة المسموح بها بالميغابكسل. اضبطه على 0 لغير محدود. |
| `MAX_WORKER_THREADS` | `0` (تلقائي) | الحد الأقصى لخيوط العامل لمعالجة الصور. اضبطه على 0 للاكتشاف التلقائي بناءً على أنوية CPU المتاحة. |
| `PROCESSING_TIMEOUT_S` | `0` (بلا حد) | الحد الأقصى لوقت المعالجة لكل طلب بالثواني. اضبطه على 0 لبلا مهلة. |
| `MAX_PIPELINE_STEPS` | `20` | الحد الأقصى لعدد الخطوات في خط الأنابيب. اضبطه على 0 لبلا حد. |
| `MAX_CANVAS_PIXELS` | `0` (بلا حد) | الحد الأقصى لحجم اللوحة بالبكسل لصور الإخراج. اضبطه على 0 لبلا حد. |
| `MAX_SVG_SIZE_MB` | `0` (غير محدود) | الحد الأقصى لحجم ملف SVG بالميغابايت. اضبطه على 0 لغير محدود. |
| `MAX_SPLIT_GRID` | `100` | الحد الأقصى لبُعد الشبكة لأداة تقسيم الصور. |
| `MAX_PDF_PAGES` | `0` (غير محدود) | الحد الأقصى لعدد صفحات PDF لتحويل PDF إلى صورة. اضبطه على 0 لغير محدود. |

### التنظيف {#cleanup}

| المتغيّر | الافتراضي | الوصف |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | مدة الاحتفاظ بنتائج المعالجة غير المحفوظة (عمليات الرفع الخام ومُخرَجات الأدوات) قبل الحذف التلقائي. الملفات التي تحفظها صراحةً في مكتبة الملفات لا تتأثر وتبقى حتى تحذفها. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | عدد مرات تشغيل مهمة التنظيف. |

### المظهر {#appearance}

| المتغيّر | الافتراضي | الوصف |
|---|---|---|
| `DEFAULT_THEME` | `light` | السمة الافتراضية للجلسات الجديدة. `light` أو `dark`. |
| `DEFAULT_LOCALE` | `en` | لغة الواجهة الافتراضية. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | تخطيط الأداة الافتراضي. `sidebar` أو `fullscreen`. |

### أذونات Docker {#docker-permissions}

| المتغيّر | الافتراضي | الوصف |
|---|---|---|
| `PUID` | `999` | شغّل عملية الحاوية بهذا المعرّف UID. اضبطه ليطابق مستخدم مضيفك للتثبيتات المرتبطة (`id -u`). |
| `PGID` | `999` | شغّل عملية الحاوية بهذا المعرّف GID. اضبطه ليطابق مجموعة مضيفك للتثبيتات المرتبطة (`id -g`). |

## مثال Docker {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
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
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## وحدات التخزين {#volumes}

تستخدم حزمة Docker Compose أربع وحدات تخزين:

- `/data` (التطبيق) - نماذج الذكاء الاصطناعي، وبيئة Python الافتراضية، وملفات المستخدم. ثبّتها للحفاظ على الملفات المرفوعة وحزم الذكاء الاصطناعي المثبَّتة عبر عمليات إعادة التشغيل.
- `/tmp/workspace` (التطبيق) - تخزين مؤقت للملفات قيد المعالجة. يمكن أن يكون عابرًا، لكن تثبيته يتجنّب ملء الطبقة القابلة للكتابة في الحاوية.
- `SnapOtter-pgdata` (postgres) - مجلد بيانات PostgreSQL. يحفظ كل البيانات العلائقية (المستخدمون، والإعدادات، وخطوط الأنابيب، والمهام، وسجل التدقيق). انسخه احتياطيًا عبر `pg_dump` أو لقطة وحدة تخزين.
- `SnapOtter-redisdata` (redis) - ملف Redis للإلحاق فقط لطوابير مهام دائمة.
