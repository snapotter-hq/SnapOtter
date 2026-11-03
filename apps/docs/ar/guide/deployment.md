---
description: "انشر SnapOtter في بيئة الإنتاج باستخدام Docker. متطلبات العتاد، وإعداد GPU، وإعدادات الوكيل العكسي لـ Nginx وTraefik وCloudflare."
i18n_source_hash: b8c4ed2cc086
i18n_provenance: machine
i18n_output_hash: 03c28742728b
i18n_hash_version: 2
---

# النشر {#deployment}

يُنشر SnapOtter كحزمة Docker Compose من 3 حاويات: صورة تطبيق SnapOtter وPostgreSQL 17 وRedis 8. تدعم صورة التطبيق **linux/amd64** (مع NVIDIA CUDA لتسريع الذكاء الاصطناعي) و**linux/arm64** (CPU)، لذا تعمل أصلياً على خوادم Intel/AMD وأجهزة Mac بمعالج Apple Silicon وأجهزة ARM مثل Raspberry Pi 4/5. تسريع وحدات iGPU من Intel/AMD عبر VA-API أو Quick Sync أو OpenCL غير مدعوم حالياً في استدلال الذكاء الاصطناعي.

راجع [صورة Docker](./docker-tags) لإعداد GPU وأمثلة Docker Compose وتثبيت الإصدارات.

## البدء السريع (CPU) {#quick-start-cpu}

```yaml
# docker-compose.yml - Copy this file and run: docker compose up -d
services:
  SnapOtter:
    image: snapotter/snapotter:latest    # or ghcr.io/snapotter-hq/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"                # Web UI + API
    volumes:
      - SnapOtter-data:/data           # AI models, user files (PERSISTENT)
      - SnapOtter-workspace:/tmp/workspace  # Temp processing files (can be tmpfs)
    environment:
      # --- Authentication ---
      - AUTH_ENABLED=true          # Set to false to disable login entirely
      - DEFAULT_USERNAME=admin     # First-run admin username
      - DEFAULT_PASSWORD=admin     # First-run admin password (you'll be forced to change it)

      # --- Database + Queue ---
      # Requests are served by a role that can only read and write rows. The
      # owner connects only during boot, to migrate and to grant. Set
      # POSTGRES_APP_PASSWORD and POSTGRES_PASSWORD for any non-local deployment.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=loopback,linklocal,uniquelocal  # Which peers may set the client IP via X-Forwarded-For (default shown)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)

      # --- Engines (empty = the image's own binaries, see Configuration) ---
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"            # Needed for Python ML shared memory
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:       # Named volume - Docker manages permissions automatically
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose up -d
```

يصبح التطبيق متاحاً بعد ذلك على `http://localhost:1349`.

تتصل الحزمة أعلاه بصفة مالك قاعدة البيانات. ابتداءً من SnapOtter 2.3.0 يمكنك خدمة الطلبات بدور يقرأ الصفوف ويكتبها فقط؛ راجع [الأدوار ذات أقل الصلاحيات](./database#least-privilege-roles).

> **هل تواجه حدود معدل Docker Hub؟** استبدل `snapotter/snapotter:latest` بـ `ghcr.io/snapotter-hq/snapotter:latest` للسحب من GitHub Container Registry بدلاً منه. يتلقى السجلان الصورة نفسها مع كل إصدار.

## البدء السريع (NVIDIA CUDA) {#quick-start-nvidia-cuda}

لتسريع NVIDIA CUDA في أدوات الذكاء الاصطناعي المدعومة (إزالة الخلفية، والتكبير، وتحسين الوجوه):

```yaml
# docker-compose-gpu.yml - Requires: NVIDIA GPU + nvidia-container-toolkit
# Install toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      # Runtime role (rows only) and the boot-only owner connection. See the CPU
      # example above.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Engines (empty = the image's own binaries, see Configuration)
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"                # Required for PyTorch CUDA shared memory
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all           # Or set to 1 for a specific GPU
              capabilities: [gpu]
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose -f docker-compose-gpu.yml up -d
```

### التحقق من تسريع GPU {#verify-gpu-acceleration}

تحقق من اكتشاف CUDA في السجلات:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

إذا كانت أدوات الذكاء الاصطناعي تعمل على CPU رغم أن `--gpus all` وNVIDIA Container Toolkit مضبوطان بشكل صحيح، فأعد تثبيت الحزمة المتأثرة (مثل Background Removal) من **Settings → AI Features**. يستعيد المثبّت إصدار GPU من ONNX Runtime، الذي قد يحجبه إصدار CPU فقط جلبته حزمة أخرى (مثل التفريغ النصي) في بيئة الذكاء الاصطناعي المشتركة. إذا لم تستعد إعادة التثبيت من الواجهة GPU على صورة أقدم، فراجع الإصلاح اليدوي في [المشكلة #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## متطلبات العتاد {#hardware-requirements}

تأتي هذه الأرقام من قياسات أُجريت على مجموعة من الأنظمة، من محطة عمل amd64 حديثة مع NVIDIA RTX 4070 نزولاً إلى Raspberry Pi، مع تشغيل كامل كتالوج الأدوات على كل منها وتغيير حدود موارد Docker للعثور على الحد الأدنى الفعلي.

هل تعمل عند الطرف الصغير من هذه الفئات (Pi، أو حاسوب محمول قديم، أو VPS بذاكرة 2 GB)؟ يحوّل [الإعدادات منخفضة الموارد](/ar/guide/low-resource) هذه الأرقام إلى شرح عملي مع حدود مضبوطة.

### مرجع سريع {#quick-reference}

| الفئة | حالة الاستخدام | CPU | RAM | GPU | التخزين |
|------|----------|-----|-----|-----|---------|
| الحد الأدنى | أدوات غير معتمدة على الذكاء الاصطناعي (صور، ملفات، PDF خفيف) مع OCR السريع المدمج واكتشاف الوجوه؛ مستخدم واحد؛ دفعات صغيرة | نواتان | 2 GB | لا شيء | ~7 GB |
| الموصى به | الأنماط الخمسة كلها بما فيها الفيديو وPDF وحزم الذكاء الاصطناعي القياسية على CPU؛ دفعات؛ عدة مستخدمين | 4 أنوية | 4 GB (8 GB للإصلاح الداخلي HQ) | لا شيء | ~25 GB |
| الكامل | كل شيء بسرعة بما فيه الذكاء الاصطناعي على GPU؛ دفعات كبيرة؛ مستخدمون كثر | 6-8 أنوية | 8 GB | NVIDIA بذاكرة VRAM لا تقل عن 8 GB (12 GB مريحة) | ~35 GB |

**المعمارية: 64 بت فقط** (`linux/amd64` أو `linux/arm64`). يعمل SnapOtter أصلياً على خوادم Intel/AMD وأجهزة Mac بمعالج Apple Silicon ولوحات ARM بنظام 64 بت بما فيها **Raspberry Pi 4 و5** (4-8 GB). ولا يعمل على ARM بنظام 32 بت (`armv7`/`armhf`) لأنه لا تُبنى له صورة، ولا على اللوحات من فئة 512 MB مثل Pi Zero التي تقل عن حد الذاكرة الأدنى (انظر أدناه).

### الحد الأدنى (أدوات الصور والملفات وPDF الخفيفة؛ دون ذكاء اصطناعي) {#minimum-image-files-and-light-pdf-tools-no-ai}

| المورد | المتطلب |
|---|---|
| CPU | نواتان |
| RAM | 2 GB |
| القرص | ~5.5 GB (الصورة) + وحدة تخزين البيانات |
| GPU | غير مطلوب |

تعمل جميع أدوات الكتالوج غير المعتمدة على الذكاء الاصطناعي وعددها 222 على عتاد متواضع، وهي: الصور (تغيير الحجم، القص، التحويل، الضغط، الضبط، العلامة المائية)، والفيديو (القص الزمني، الكتم، إعادة التغليف)، والصوت (التحويل، التسوية، القص الزمني)، وPDF (الدمج، التقسيم، الضغط، التدوير، الحماية)، وتحويلات الملفات، والإعدادات المسبقة المخصصة للتحويل. تنتهي معظم العمليات في أقل بكثير من ثانية حتى مع ملف كبير: صورة بحجم 2.7 MB يتغير حجمها في نحو 0.05 ثانية وتُعاد ترميزها إلى WebP في نحو ثانيتين.

حد الذاكرة الأدنى حقيقي، وفق اختبار تغيير حدود موارد Docker: **لا يمكن لـ 512 MB تشغيل الحزمة** (حتى تغيير حجم صورة واحدة يُنهى)، و**1 GB** يتعامل مع عمليات الملف الواحد لكن الدفعة متعددة الملفات تنفد ذاكرتها، و**2 GB مع نواتين** هو أصغر إعداد يتعامل مع الدفعات غير المعتمدة على الذكاء الاصطناعي بارتياح. كما يتسع 2 GB لـ OCR السريع المدمج وحزمة `face-detection`، بينما تحتاج حزم الذكاء الاصطناعي الأكبر (Whisper وLaMa/DDColor وrembg وRealESRGAN واستعادة الصور والإصلاح الداخلي عالي الجودة SD1.5) إلى 4 حتى 8 GB من RAM وتُرفض مسبقاً عندما تكون الذاكرة الفارغة دون الحد الأدنى لكل حزمة.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**الاستثناء الوحيد الثقيل على CPU هو إعادة ترميز الفيديو.** عمليات نسخ التدفق (القص الزمني، الكتم، إعادة تغليف الحاوية) فورية، لكن الترميز إلى ترميز مختلف يعتمد على CPU. مقطع 1080p بمدة 45 ثانية يُعاد ترميزه إلى VP9 (WebM) يستغرق نحو **40 ثانية** على معالج حديث سريع، ونحو 45 ثانية على Apple Silicon، ونحو 80 ثانية على معالج محمول أقدم بأربع أنوية، ونحو **130 ثانية** على خادم أقدم بأربع أنوية. إذا كان حملك يعتمد كثيراً على الفيديو، فأعطِ الأولوية لأنوية CPU وسرعة الساعة، أو ارفع حد `cpus:` للحاوية، فحزمة compose المرفقة تحدد التطبيق بأربع أنوية افتراضياً (8 في compose الخاص بـ GPU).

### الموصى به (أدوات الذكاء الاصطناعي على CPU) {#recommended-ai-tools-on-cpu}

| المورد | المتطلب |
|---|---|
| CPU | 4 أنوية |
| RAM | 4 GB |
| القرص | 3 GB (الصورة) + نحو 20 GB (جميع حزم الذكاء الاصطناعي الاختيارية) + مساحة العمل |
| GPU | غير مطلوب (بديل CPU) |

**تثبيت حزم الذكاء الاصطناعي الأكبر وتشغيلها هو ما يرفع التوصية إلى 4 GB من RAM.** دون تثبيت أي حزم اختيارية يبقى التطبيق خاملاً عند نحو 360 MB. تشترك أدوات Python القديمة في sidecar واحد، بينما يستخدم OCR الدقيق موزِّعاً مخصصاً طويل العمر مثبَّتاً على الجيل الحالي غير القابل للتغيير. قبل التفعيل، يشغّل المثبّت اختبار تشغيل أولي على المرشح. ثم ينتقل ذرياً إلى الموزِّع الجديد ويصرّف الموزِّع السابق قبل تنظيف الذاكرة. يجب أن يجتاز كل أثر رسمي لـ OCR الدقيق مجموعة اختبارات الإصدار لأسوأ الحالات داخل cgroup بسعة 4 GiB، بينما تترك توصية المضيف بسعة 4 GB هامشاً لتطبيق Node.js وPostgres وRedis والطوابير والأعمال المتزامنة.

معظم أدوات الذكاء الاصطناعي قابلة للاستخدام تماماً على CPU؛ وأداتان أو ثلاث تحتاج فعلاً إلى GPU. القياسات على معالج حديث بأربع أنوية:

| أداة الذكاء الاصطناعي | الزمن على CPU | قابلة للاستخدام على CPU؟ |
|---|---|---|
| اكتشاف الوجوه (blur-faces وsmart-crop وred-eye)، وإزالة الضوضاء | أقل من ثانية | نعم |
| OCR، والتفريغ النصي، والترجمة | 1-3 ثوانٍ | نعم |
| التلوين، وتحسين الوجوه | ~10 ثوانٍ | نعم |
| إزالة الخلفية / استبدالها / تمويهها | ~29 ثانية | نعم (ستنتظر) |
| التكبير بالذكاء الاصطناعي (RealESRGAN) | ~33 ثانية للصغيرة؛ دقائق للصور الكبيرة | هامشية: يُوصى بشدة باستخدام GPU |
| استعادة الصور (المسار الكامل) | عدة دقائق | لا: تحتاج إلى GPU أو معالج سريع متعدد الأنوية |

لا يضمّن SnapOtter عمداً تنزيلات هذه النماذج في صورة Docker. تُسحب حزم الذكاء الاصطناعي فقط عندما يفعّل المسؤول الأداة المرتبطة، وتُخزَّن في وحدة التخزين الدائمة `/data/ai`، وتتشاركها كل أداة تعتمد على حزمة النماذج نفسها. يُبقي هذا صورة الحاوية النهائية صغيرة مع إتاحة وصول التثبيت الكامل للذكاء الاصطناعي إلى أرقام التخزين الأكبر أدناه.

تعتمد بعض الأدوات على أكثر من حزمة مشتركة. فمثلاً تحتاج Passport Photo إلى `background-removal` و`face-detection` معاً؛ وإذا كانت `background-removal` مثبَّتة مسبقاً، فإن تفعيل Passport Photo لا يُنزّل إلا حزمة `face-detection` الناقصة. ينطبق إعادة الاستخدام نفسه على جميع أدوات الذكاء الاصطناعي.

مساحة تخزين حزم الذكاء الاصطناعي الاختيارية وحدود ذاكرة CPU الدنيا (يفحص SnapOtter الذاكرة المتاحة قبل الإرسال إلى Python sidecar ويرفض فوراً التشغيلات الأقل من حد الذاكرة الفارغة للحزمة):

| الحزمة | حجم القرص | حد ذاكرة CPU الأدنى |
|---|---|---|
| اكتشاف الوجوه | 200-300 MB | 2 GB من RAM المضيف (~0.5 GB فارغة) |
| التفريغ النصي | ~600 MB | 4 GB من RAM المضيف (~2 GB فارغة) |
| ماسحة الكائنات + التلوين | 1-2 GB | 4 GB من RAM المضيف (~2 GB فارغة) |
| OCR الدقيق (`balanced`/`best`) | تنزيل ~208-234 MiB / مثبَّتة ~409-488 MiB | 4 GiB من الذاكرة الفعلية المضبوطة (يعمل `fast` على 2 GB) |
| إزالة الخلفية | 4-5 GB | 4 GB من RAM المضيف (~2.5 GB فارغة) |
| التكبير + تحسين الوجوه + إزالة الضوضاء | 5-6 GB | 4 GB من RAM المضيف (~2.5 GB فارغة) |
| استعادة الصور | 4-5 GB | 4 GB من RAM المضيف (~3 GB فارغة) |
| الإصلاح الداخلي عالي الجودة (`inpaint-hq`) | 5-7 GB | 8 GB من RAM المضيف (~6 GB فارغة) |
| **جميع الحزم** | **~25 GB مثبَّتة** | **4 GB (8 GB مع `inpaint-hq`)** |

OCR السريع مدمج في الصورة عبر Tesseract، ويضيف نحو 25 MiB، ولا يتطلب حزمة OCR الاختيارية ولا متطلب ذاكرتها البالغ 4 GiB. يدعم السريع `auto` و`en` و`de` و`es` و`fr` و`zh` و`ja`، لكنه لا يدعم الكورية (`ko`) ولا العربية (`ar`). كلتاهما تستخدمان `balanced` أو `best` وبالتالي تتطلبان الحزمة الدقيقة. الحزمة الدقيقة متوفرة في حاويات Linux الرسمية amd64 وarm64 وتشغّل ONNX Runtime على CPU. تستخدم مضيفات NVIDIA بيئة تشغيل OCR نفسها على CPU، لذا لا يعتمد OCR على إصدار CUDA أو معمارية GPU. تتطلب بيئة التشغيل الدقيقة ما لا يقل عن 4 GiB من الذاكرة الفعلية: حد cgroup المضبوط للحاوية، وإلا فذاكرة المضيف. يرفض SnapOtter الأنظمة الأقل من هذا الحد الأدنى الموقَّع للتوافق قبل تنزيل الحزمة. كما يُرفض تثبيت الحزمة الدقيقة على الأرشيفات المبنية مسبقاً أو المثبَّتة مباشرة على العتاد التي لا يمكن ضمان libc وPython ABI فيها. على تلك المضيفات غير المدعومة، يعيد OCR للكورية والعربية خطأ عدم توافق صريحاً ولا يعود بصمت إلى السريع.

يجب أن تستخدم النسخ المتماثلة التي تتشارك `DATA_DIR` نفسه معمارية CPU نفسها؛ ثبّت عمليات النشر متعددة النسخ بالتقارب مع العقد (node affinity). تحتاج النسخ المتماثلة المختلطة amd64/arm64 إلى وحدات تخزين بيانات منفصلة وعمليات نشر SnapOtter مستقلة.

تحتفظ بيئة التشغيل الدقيقة بجيل واحد نشط وتمسح ذاكرة التنزيل المؤقتة بعد التفعيل. في هذا الإصدار، يحتاج التثبيت الأول مؤقتاً إلى نحو 620-720 MiB للأرشيف مع التجهيز، وقد تصل الترقية إلى ذروة قرب 1.2 GiB بينما يظل الجيل القديم نشطاً. يحسب المثبّت المتطلب الدقيق من الفهرس الموقَّع والأجيال الحالية قبل التنزيل أو الاستخراج، ويفشل مبكراً إذا كانت وحدة تخزين البيانات صغيرة جداً.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### الكامل (أدوات الذكاء الاصطناعي على NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| المورد | المتطلب |
|---|---|
| CPU | 6-8 أنوية (تجهيز الفيديو والتزامن يعملان على CPU حتى مع الذكاء الاصطناعي على GPU) |
| RAM | 8 GB |
| GPU | NVIDIA بذاكرة VRAM لا تقل عن 8 GB (يوصى بـ 12 GB) |
| القرص | ~35 GB إجمالاً |

تسرّع وحدة GPU من NVIDIA (CUDA) نماذج الذكاء الاصطناعي الثقيلة بشكل كبير. القياسات على RTX 4070 مقابل معالج حديث:

| أداة الذكاء الاصطناعي | التسريع مع GPU | ملاحظات |
|---|---|---|
| التكبير بالذكاء الاصطناعي (RealESRGAN 2×) | **~47×** | أكبر مكسب: أقل من ثانية مقابل ~33 ثانية (دقائق للصور الكبيرة) |
| تحسين الوجوه (CodeFormer) | **~12×** | ~0.9 ثانية مقابل ~11 ثانية |
| التفريغ النصي (Whisper) | ~4.5× | |
| إزالة الخلفية / استبدالها / تمويهها | ~4× | ~7 ثوانٍ على GPU مقابل ~29 ثانية على CPU |
| التلوين | ~1.8× | |
| OCR، واكتشاف الوجوه، وred-eye، وإزالة الضوضاء | ~1× | سريعة أصلاً على CPU: لا يفيد GPU |
| استعادة الصور | لا شيء | تعتمد على CPU حتى مع GPU (استخدام GPU بنسبة 0%)؛ سرعة CPU هنا أهم من GPU |

الأدوات التي تستحق GPU هي **التكبير وتحسين الوجوه والتفريغ النصي وإزالة الخلفية**. اكتشاف الوجوه وOCR وred-eye تعتمد على CPU وسريعة أصلاً، لذا لا يضيف GPU شيئاً.

يصل الاستخدام الأقصى لـ VRAM إلى 7.5 GB أثناء التكبير مع تحسين الوجوه. تعمل وحدة GPU من NVIDIA بسعة 6 GB مع معظم أدوات الذكاء الاصطناعي كلٌّ على حدة لكنها ستفشل في التكبير. تتعامل ذاكرة VRAM من 8 إلى 12 GB مع كل شيء.

تسريع وحدات iGPU من Intel/AMD عبر VA-API أو Quick Sync أو OpenCL غير مدعوم حالياً في استدلال الذكاء الاصطناعي. ربط `/dev/dri` داخل الحاوية لا يفعّل تسريع GPU للذكاء الاصطناعي؛ سيشغّل SnapOtter أدوات الذكاء الاصطناعي على CPU ما لم يتوفر NVIDIA CUDA.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

### المستخدمون المتزامنون {#concurrent-users}

طلبات تغيير حجم صور متوازية على حاوية التطبيق الافتراضية المحدودة بأربع أنوية:

| الطلبات المتزامنة | متوسط زمن الاستجابة | الأخطاء |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

يتدهور زمن الاستجابة بشكل دون خطي ودون أخطاء مع تشبع مجمّع العمال. رفع حد `cpus:` لحاوية التطبيق (أو استخدام مضيف بأنوية أكثر) يرفع السقف. لاحظ أن المهام الثقيلة (ترميز الفيديو، والذكاء الاصطناعي على CPU) تحتجز عاملاً طوال مدتها، لذا حدّد حجم CPU وفق عدد المهام الثقيلة المتزامنة المتوقعة، لا عدد الطلبات فقط.

### صيغ الصور المدعومة {#supported-image-formats}

يدعم SnapOtter **أكثر من 55 صيغة إدخال** و**14 صيغة إخراج**، بما فيها ملفات RAW من أكثر من 20 علامة كاميرا، والصيغ الاحترافية (PSD وEPS وOpenEXR وHDR)، والترميزات الحديثة (JPEG XL وAVIF وHEIC وQOI)، والصيغ العلمية وصيغ الألعاب (FITS وDDS).

راجع [قائمة الصيغ الكاملة](/ar/guide/supported-formats) لتفاصيل كل صيغة مدعومة، والمفكك المستخدم، وعناصر التحكم المتاحة في الجودة.

### القيود المعروفة {#known-limitations}

- **تغيير الحجم الواعي بالمحتوى** ينهار مع الصور الكبيرة (أكثر من 5 ميغابكسل) بسبب قيد في الملف التنفيذي caire. يعمل جيداً مع الصور الأصغر.
- **فك ترميز HEIF** يستغرق 13-23 ثانية. أما HEIC (نسخة Apple) فأسرع بكثير عند 0.3-0.9 ثانية.
- **التكبير** تنتهي مهلته على CPU لأي شيء يتجاوز الصور الصغيرة. يلزم GPU للاستخدام العملي.
- **تحسين الوجوه عبر CodeFormer** أبطأ بكثير من GFPGAN (53 ثانية مقابل 2 ثانية على GPU). يوصى بـ GFPGAN لمعظم حالات الاستخدام.

## وحدات التخزين {#volumes}

| نقطة الربط / وحدة التخزين | الغرض | مطلوبة؟ |
|---|---|---|
| `/data` (التطبيق) | نماذج الذكاء الاصطناعي، وبيئة Python الافتراضية، وملفات المستخدم | **نعم**: فقدان الملفات بدونها |
| `/tmp/workspace` (التطبيق) | ملفات المعالجة المؤقتة (تُنظَّف تلقائياً) | موصى بها |
| `SnapOtter-pgdata` (postgres) | دليل بيانات PostgreSQL (المستخدمون والإعدادات وخطوط المعالجة والمهام) | **نعم**: فقدان البيانات بدونها |
| `SnapOtter-redisdata` (redis) | ملف Redis للإلحاق فقط لطوابير المهام الدائمة | موصى بها |

### نقاط الربط (Bind mounts) مقابل وحدات التخزين المسماة {#bind-mounts-vs-named-volumes}

**وحدات التخزين المسماة** (موصى بها): يدير Docker الأذونات تلقائياً:
```yaml
volumes:
  - SnapOtter-data:/data
```

**نقاط الربط**: تدير الأذونات بنفسك. اضبط `PUID`/`PGID` ليطابقا مستخدم المضيف لديك:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### أذونات التخزين {#storage-permissions}

يكتب SnapOtter إلى موقعين أثناء التشغيل: `/data` (ملفات المستخدم والسجلات ونماذج الذكاء الاصطناعي وبيئة Python الافتراضية) و`/tmp/workspace` (مساحة المعالجة المؤقتة). يجب أن يكون كلاهما قابلاً للكتابة من المستخدم الذي تعمل به الحاوية. إذا لم يكن أي منهما كذلك، **تفشل الحاوية سريعاً عند البدء** مع رسالة تسمّي الدليل وUID/GID الجاري وكيفية الإصلاح، بدلاً من أن تبدأ "سليمة" ثم تفشل عند أول رفع بخطأ غامض. يُفحص دليل السجلات (`LOG_DIR`، `/data/logs` في الصورة) بالطريقة نفسها، في كل أوضاع التخزين، لأن السجلات تبقى محلية حتى عندما تكون الملفات في S3.

تعتمد طريقة التعامل مع الأذونات على كيفية تشغيل الحاوية:

**الافتراضي (يبدأ كـ root ثم ينتقل إلى `snapotter`)**: تبدأ نقطة الدخول بصلاحيات root، وتصلح ملكية وحدات التخزين المربوطة، ثم تنتقل إلى المستخدم غير المميز `snapotter` عبر `gosu`. تعمل وحدات التخزين المسماة دون أي إعداد. أما نقاط الربط، فاضبط `PUID`/`PGID` على مستخدم المضيف لديك (أعلاه) لتكون الملفات التي تكتبها مملوكة لك.

**Kubernetes / OpenShift (غير root عبر `runAsUser`)**: عند التشغيل مباشرة بمستخدم غير root، لا تستطيع الحاوية تنفيذ chown على وحدات التخزين بنفسها، لذا يجب أن يجعلها المنسّق قابلة للكتابة. اضبط `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

الأدلة القابلة للكتابة في الصورة مملوكة جماعياً لـ GID 0 وقابلة للكتابة من المجموعة، لذا يمكن لـ Pod يعمل بـ **UID عشوائي** مع المجموعة التكميلية root (الافتراضي في OpenShift) أن يكتب دون `chown`.

**TrueNAS Scale (وإعدادات "UID الغريب" الأخرى)**: يشغّل TrueNAS التطبيقات بمستخدم غير root (غالباً `568:568`) ويربط مجموعات بيانات المضيف المملوكة لمستخدم مختلف، فلا تجعلها نقطة الدخول ولا `fsGroup` قابلة للكتابة وحدها. اختر أحد الخيارات:

- **شغّل التطبيق كـ root** (موصى به): اترك مستخدم التطبيق غير مضبوط أو اضبطه على `0`، ودع نقطة الدخول الافتراضية تصلح الأذونات وتنتقل إلى `snapotter`.
- **شغّل بـ UID ‏`999`**: اضبط مستخدم/مجموعة التطبيق على `999:999` (مستخدم SnapOtter المدمج `snapotter`) ليطابق ملكية الصورة.
- **نفّذ `chown` على مجموعة بيانات المضيف** إلى UID الذي تعمل به الحاوية، من صدفة TrueNAS:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

يسمّي خطأ البدء الـ UID المطلوب بالضبط، لذا فأسرع طريق هو تشغيل التطبيق مرة واحدة وقراءة الرسالة ثم `chown` (أو تعديل المستخدم) وفقاً لذلك.

## متغيرات البيئة {#environment-variables}

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `AUTH_ENABLED` | `true` | تفعيل/تعطيل اشتراط تسجيل الدخول |
| `DEFAULT_USERNAME` | `admin` | اسم مستخدم المسؤول الأولي |
| `DEFAULT_PASSWORD` | `admin` | كلمة مرور المسؤول الأولية (يُفرض تغييرها عند أول تسجيل دخول) |
| `MAX_UPLOAD_SIZE_MB` | `0` (غير محدود) | حد الرفع لكل ملف بالميغابايت. تُشحن الصورة بـ `0`؛ ويبدأ البناء من المصدر عند 100 |
| `MAX_BATCH_SIZE` | `0` (غير محدود) | الحد الأقصى للملفات في طلب الدفعة الواحد. تُشحن الصورة بـ `0`؛ ويبدأ البناء من المصدر عند 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | طلبات API في الدقيقة لكل IP (اضبط 0 للتعطيل) |
| `MAX_USERS` | `0` (غير محدود) | الحد الأقصى لحسابات المستخدمين |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | الأقران المسموح لهم بتعيين IP العميل عبر `X-Forwarded-For`. الشبكات الخاصة فقط افتراضياً |
| `PUID` | `999` | التشغيل بهذا الـ UID (لأذونات نقاط الربط) |
| `PGID` | `999` | التشغيل بهذا الـ GID (لأذونات نقاط الربط) |
| `LOG_LEVEL` | `info` | تفصيل السجلات: fatal وerror وwarn وinfo وdebug وtrace |
| `CONCURRENT_JOBS` | `0` (تلقائي) | الحد الأقصى لمهام معالجة الذكاء الاصطناعي المتوازية |
| `SESSION_DURATION_HOURS` | `168` | مدة جلسة تسجيل الدخول (7 أيام) |
| `CORS_ORIGIN` | (فارغ) | الأصول المسموح بها مفصولة بفواصل، أو فارغ للأصل نفسه |

### الوكيل الصادر وCA الخاصة {#outbound-proxy-and-private-ca}

تفعّل الحاوية الرسمية دعم الوكيل عبر متغيرات البيئة في Node. إذا كان على SnapOtter الوصول إلى مستودع بيئة تشغيل OCR أو خدمات HTTPS أخرى عبر وكيل للشركة، فاضبط `HTTPS_PROXY` (و`HTTP_PROXY` عند الحاجة). اضبط `NO_PROXY` على قائمة مفصولة بفواصل من المضيفات التي يجب الوصول إليها مباشرة، مثل Postgres وRedis والتخزين الكائني الداخلي.

إذا كان الوكيل أو خدمة داخلية موقَّعة من مرجع شهادات خاص، فاربط شهادة CA للقراءة فقط ووجّه `NODE_EXTRA_CA_CERTS` إليها. يجب أن يكون الملف موجوداً عند بدء عملية Node:

```yaml
services:
  app:
    environment:
      HTTPS_PROXY: http://proxy.example.internal:3128
      HTTP_PROXY: http://proxy.example.internal:3128
      NO_PROXY: postgres,redis,minio,localhost,127.0.0.1
      NODE_EXTRA_CA_CERTS: /etc/snapotter/custom-ca.pem
    volumes:
      - ./company-ca.pem:/etc/snapotter/custom-ca.pem:ro
```

أبقِ بيانات اعتماد الوكيل خارج ملف Compose (مثلاً في ملف `.env` محمي أو سر). لا تعطّل التحقق من TLS: يصادق الفهرس الموقَّع لـ OCR على بيانات الإصدار الوصفية، بينما يظل التحقق العادي من TLS يحمي النقل وكل طلب صادر آخر.

## فحص السلامة {#health-check}

تتضمن الحاوية فحص سلامة مدمجاً:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## الوكيل العكسي {#reverse-proxy}

القيمة الافتراضية لـ `TRUST_PROXY` هي `loopback,linklocal,uniquelocal`، لذا لا يصدّق SnapOtter `X-Forwarded-For` إلا من قرين على شبكة خاصة. الوكيل العكسي على المضيف نفسه أو على شبكة Docker أو على شبكتك المحلية موثوق به مباشرة، أي أن تحديد المعدل ومحدِّد القوة الغاشمة لتسجيل الدخول وسجل التدقيق وقائمة السماح لـ IP في الإصدار المؤسسي كلها ترى IP العميل الحقيقي دون أي إعداد.

اضبط `TRUST_PROXY=true` فقط عندما يصل الوكيل الذي أمامه إلى SnapOtter من عنوان **عام**، مثل موازن حمل سحابي على شبكة مختلفة. على نسخة معرّضة مباشرة، تجعل تلك القيمة `request.ip` تحت سيطرة المهاجم، لأن المتصل الذي يغيّر الترويسة يحصل على دلو تحديد معدل جديد لكل طلب.

أمران يجب معرفتهما قبل أن تبدأ في قياس عناوين IP للعملاء. يخدم Docker Desktop على macOS وWindows المنفذ المنشور عبر وكيل في فضاء المستخدم يعيد كتابة كل عنوان مصدر إلى بوابة الجهاز الافتراضي `192.168.65.1`، لذا لا تستعيد أي قيمة لـ `TRUST_PROXY` العميل الحقيقي هناك؛ انشر على Linux لأي شيء مواجه للإنترنت. وعلى أي منصة، يُلاحظ الوصول إلى منفذ منشور عبر `localhost` على أنه بوابة الجسر لا عميلك، لذا فإن اختبار localhost لا يخبرك بشيء عن كيفية نسب عميل حقيقي. الجدول الكامل لقيم `TRUST_PROXY` وتحذير Docker Desktop موجودان في [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

أمران مهمان لكل وكيل أدناه: اسمح بأجسام طلبات كبيرة (للرفع)، ولا تخزّن الاستجابات مؤقتاً. الوكيل الذي يخزّن الاستجابات يكسر تقدم SSE، والأوضح من ذلك أنه يجعل تنزيل ملف كبير "يبدأ لكنه لا ينتهي أبداً"، لأن الوكيل يحتفظ بالملف كله قبل تمريره. يرسل SnapOtter `X-Accel-Buffering: no` على التنزيلات ليبثّها nginx حتى لو تُرك التخزين المؤقت مفعلاً في مكان آخر، لكن الوكلاء غير nginx يحتاجون إلى تعطيل تخزين الاستجابات صراحةً (يظهر في كل إعداد أدناه). إذا توقف تنزيل في منتصفه، فوجود وكيل يخزّن مؤقتاً في المقدمة هو أول ما يجب فحصه.

ملاحظة حول HSTS: ترسل API الترويسة `Strict-Transport-Security` مع كل استجابة بنفسها، لذا فإن الوكيل الذي يمرر ترويسات الاستجابة (وكل الإعدادات أدناه تفعل) لا يحتاج إلى أي إعداد HSTS خاص به. فقط إذا كان الوكيل مضبوطاً على إزالة ترويسات الاستجابة الواردة أو تجاوزها، فعليك الحفاظ على الترويسة أو إعادة إضافتها عند الحافة.

### Nginx {#nginx}

```nginx
server {
    # Plain HTTP shown for brevity. Terminate TLS in your own `listen 443 ssl`
    # server block; the Strict-Transport-Security header the API sends passes
    # through with every proxied response, so no add_header is needed there.
    listen 80;
    server_name images.example.com;

    # Match MAX_UPLOAD_SIZE_MB (0 = nginx default 1M, so set high for unlimited)
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:1349;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Stream responses instead of buffering: needed for SSE progress
        # (batch, AI, feature installs) and for large file downloads.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### النشر تحت مسار فرعي {#subpath}

لخدمة `https://example.com/snapotter`، اضبط `BASE_PATH=/snapotter` في
بيئة حاوية SnapOtter وأعد تشغيلها. تقبل ملفات Compose الرسمية لـ CPU وGPU
أيضاً `BASE_PATH` من صدفتك أو من ملف Compose ‏`.env`. تعمل الصورة نفسها
على أي مسار؛ ولا حاجة لإعادة بناء الواجهة الأمامية.

يقبل `BASE_PATH` مقاطع مفصولة بشرطة مائلة تحتوي على أحرف وأرقام و`_` أو
`-`، بما فيها المسارات المتداخلة مثل `/apps/snapotter`. الشرطة المائلة اللاحقة
اختيارية. اتركه فارغاً (الافتراضي)، أو اضبط `/`، للنشر على الجذر.

في كتلة خادم HTTPS الحالية لديك في Nginx، استخدم:

```nginx
location = /snapotter {
    return 308 /snapotter/$is_args$args;
}
location /snapotter/ {
    proxy_pass http://localhost:1349;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 500M;
    proxy_buffering off;
    proxy_read_timeout 300s;
}
```

يحافظ هذا المثال على البادئة. والوكلاء الذين يزيلون `/snapotter` قبل
التمرير مدعومون أيضاً. يمكن لفحوص السلامة الداخلية مواصلة استخدام
`/api/v1/health`. بالنسبة إلى OIDC أو SAML، اضبط أيضاً
`EXTERNAL_URL=https://example.com/snapotter` وحدّث عناوين الاستدعاء (callback) لدى مزود الهوية
لتتضمن `/snapotter/api/auth/oidc/callback` أو
`/snapotter/api/auth/saml/callback` على التوالي.

تواصل سكربتات API العمل دون تغيير: تبدأ عناوين URL في استجابات API، مثل
`downloadUrl` الخاص بأداة، بـ `/api/` أياً كانت قيمة `BASE_PATH`. أضفها إلى عنوان
URL الأساسي لنسختك (`https://example.com/snapotter` + `/api/v1/download/...`)
بدلاً من حلّها مقابل جذر النطاق.

افتح الواجهة عبر URL ذي البادئة (`https://example.com/snapotter`). يُوجَّه المتصفح
الذي يصل دون البادئة إليها تلقائياً؛ ويُتوقع أن تصل طلبات API فقط
إلى التطبيق دون بادئة. إذا قالت السجلات
`Requests arrive under /snapotter/ but BASE_PATH is empty`، فإن الوكيل
يمرر بادئة لا يعلنها `BASE_PATH`: اضبط `BASE_PATH` عليها،
أو أزل البادئة عند الوكيل.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. أضف Proxy Host جديداً
2. اضبط Domain Name على نطاقك
3. اضبط Scheme على `http`، وForward Hostname على `SnapOtter` (أو IP حاويتك)، وForward Port على `1349`
4. فعّل دعم WebSocket
5. ضمن Advanced، أضف: `client_max_body_size 500M;` و`proxy_buffering off;`

تمر ترويسة `Strict-Transport-Security` الخاصة بـ API عبر NPM كما هي؛ ومفتاح HSTS في تبويب SSL اختياري فوقها.

### Traefik {#traefik}

```yaml
# Add these labels to the SnapOtter service in docker-compose.yml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.snapotter.rule=Host(`images.example.com`)"
  - "traefik.http.routers.snapotter.entrypoints=websecure"
  - "traefik.http.routers.snapotter.tls.certresolver=letsencrypt"
  - "traefik.http.services.snapotter.loadbalancer.server.port=1349"
  # Increase upload limit (default 2MB is too low)
  - "traefik.http.middlewares.snapotter-body.buffering.maxRequestBodyBytes=524288000"
  - "traefik.http.routers.snapotter.middlewares=snapotter-body"
```

يمرر Traefik ترويسات الاستجابة الواردة دون تغيير، لذا تصل ترويسة `Strict-Transport-Security` الخاصة بـ API إلى المتصفحات دون وسيط `headers`. إذا كنت تشغّل بالفعل واحداً يعيد كتابة ترويسات الاستجابة، فتأكد من أنه يترك تلك الترويسة سليمة.

### Caddy {#caddy}

```txt
images.example.com {
    reverse_proxy localhost:1349 {
        flush_interval -1
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }
}
```

يعطّل `flush_interval -1` تخزين الاستجابات مؤقتاً، وهو مطلوب لأحداث تقدم SSE (معالجة الدفعات وأدوات الذكاء الاصطناعي وتثبيت الميزات) ولكي تُبثّ تنزيلات الملفات الكبيرة بدلاً من أن تتوقف. تتيح المهل الممتدة اكتمال رفع الملفات الكبيرة دون أن يغلق Caddy الاتصال مبكراً. كما يمرر Caddy ترويسة `Strict-Transport-Security` الخاصة بـ API دون تعديل، فلا حاجة إلى توجيه `header` لـ HSTS.

### أنفاق Cloudflare {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

ملاحظة: لدى Cloudflare حد رفع 100 MB في الخطط المجانية. اضبط `MAX_UPLOAD_SIZE_MB=100` ليتوافق معه.

يمرر النفق ترويسات استجابة API، بما فيها `Strict-Transport-Security`، فلا حاجة إلى إعداد HSTS في لوحة التحكم (إعداد HSTS الخاص بحافة Cloudflare اختياري فوق ذلك).

## استكشاف الأخطاء وإصلاحها {#troubleshooting}

### "Postgres not reachable: EAI_AGAIN" بعد فشل أول بدء مباشرة {#eai-again-after-failed-first-start}

إذا فشل `docker compose up -d` الأول جزئياً (السبب المعتاد هو منفذ قيد الاستخدام)، فقد تؤدي إعادة محاولة `up -d` العادية إلى بدء حاوية التطبيق دون ربطها بشبكة compose. عندها يدخل التطبيق في حلقة انهيار مع:

```
Postgres not reachable: EAI_AGAIN
```

بينما يُظهر `docker ps` أن postgres سليم. الخطأ حقيقي لكنه يشير إلى الحاوية الخطأ: فبدون الشبكة لا يمكن حلّ DNS لاسم المضيف `postgres` إطلاقاً، وتعيد سياسة إعادة التشغيل الفشل نفسه إلى الأبد.

أصلح ما تسبب في فشل أول بدء (غالباً: حرّر المنفذ)، ثم أجبر على إعادة إنشاء حاوية التطبيق لتعيد الاتصال بالشبكة:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: يمكن الوصول من الأجهزة الأخرى، لا من الحاسوب نفسه {#windows-wsl2-loopback}

مع تشغيل Docker داخل WSL2 (إعداد Windows المعتاد)، قد تكون الحزمة متاحة من كل جهاز آخر على شبكتك بينما تنتهي مهلة `http://localhost:1349` على مضيف Windows نفسه، حتى مع تفعيل وضع الشبكات المعكوسة (mirrored) في WSL. لا يظهر المنفذ أبداً في `netstat` في Windows، ولا يوجد خلل في الحاويات.

افتح التطبيق من جهاز آخر، أو من داخل التوزيعة باستخدام عنوانها الخاص (`hostname -I` في صدفة WSL). إذا نجح توجيه localhost في إصدار WSL لديك، فاعتبره ميزة إضافية لا شيئاً تعتمد عليه.

## CI/CD {#ci-cd}

يحتوي مستودع GitHub على ثلاثة سير عمل:

- **ci.yml**: يعمل تلقائياً مع كل دفع وPR. يفحص lint وtypecheck ويشغّل الاختبارات ويبني ويتحقق من صورة Docker (دون دفعها).
- **release.yml**: يُشغَّل يدوياً عبر `workflow_dispatch`. يشغّل semantic-release لإنشاء وسم إصدار وإصدار GitHub، ثم يبني صورة Docker متعددة المعماريات (amd64 + arm64) ويدفعها إلى Docker Hub (`snapotter/snapotter`) وGitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml**: يبني موقع التوثيق هذا وينشره على Cloudflare Pages عند الدفع إلى `main`.

لإنشاء إصدار، انتقل إلى **Actions > Release > Run workflow** في واجهة GitHub، أو شغّل:

```bash
gh workflow run release.yml
```

يحدد semantic-release الإصدار من سجل الـ commits. يشير وسم Docker ‏`latest` دائماً إلى أحدث إصدار.

## التحليلات {#analytics}

يتضمن SnapOtter تحليلات منتج مجهولة (أنماط استخدام الأدوات وتقارير الأخطاء) للمساعدة في اكتشاف الأخطاء وتحسين الميزات. وهي مفعلة افتراضياً. ملفاتك وأسماء ملفاتك وبياناتك الشخصية ليست جزءاً منها أبداً. يعمل SnapOtter بشكل طبيعي مع تعطيل التحليلات.

### تعطيل التحليلات {#disabling-analytics}

الإيقاف أثناء التشغيل هو مفتاح بنقرة واحدة للمسؤول. افتح Settings > System > Privacy وأوقف Anonymous Product Analytics. يتوقف فوراً للنسخة بأكملها، دون إعادة بناء.

للحصول على صورة لا يمكنها إصدار التحليلات أبداً، اضبط الإيقاف الصارم وقت البناء باستنساخ المستودع وإعادة البناء:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

أو أضف وسيط البناء إلى `docker-compose.yml` الحالي لديك:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```