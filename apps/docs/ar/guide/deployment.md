---
description: "انشر SnapOtter في بيئة الإنتاج باستخدام Docker. متطلبات العتاد، وإعداد GPU، وإعدادات الوكيل العكسي لكل من Nginx وTraefik وCloudflare."
i18n_source_hash: 3821f105f4ba
i18n_provenance: machine
i18n_output_hash: 9420e3dc086f
i18n_hash_version: 2
---

# النشر {#deployment}

يُنشر SnapOtter كحزمة Docker Compose من 3 حاويات: صورة تطبيق SnapOtter، وPostgreSQL 17، وRedis 8. تدعم صورة التطبيق **linux/amd64** (مع NVIDIA CUDA لتسريع الذكاء الاصطناعي) و**linux/arm64** (وحدة المعالجة المركزية)، لذا تعمل أصليًا على خوادم Intel/AMD وأجهزة Mac بمعالج Apple Silicon وأجهزة ARM مثل Raspberry Pi 4/5. أما تسريع المعالج الرسومي المدمج من Intel/AMD عبر VA-API أو Quick Sync أو OpenCL فغير مدعوم حاليًا لاستدلال الذكاء الاصطناعي.

راجع [صورة Docker](./docker-tags) لإعداد GPU وأمثلة Docker Compose وتثبيت الإصدار.

## بدء سريع (CPU) {#quick-start-cpu}

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

يصبح التطبيق متاحًا بعد ذلك على `http://localhost:1349`.

تتصل الحزمة أعلاه بصفتها مالك قاعدة البيانات. ابتداءً من SnapOtter 2.3.0 يمكنك تلبية الطلبات بدور يقرأ الصفوف ويكتبها فقط؛ راجع [الأدوار ذات الحد الأدنى من الصلاحيات](./database#least-privilege-roles).

> **هل تواجه حدود معدل Docker Hub؟** استبدل `snapotter/snapotter:latest` بـ `ghcr.io/snapotter-hq/snapotter:latest` للسحب من GitHub Container Registry بدلًا من ذلك. يتلقى السجلان الصورة نفسها مع كل إصدار.

## بدء سريع (NVIDIA CUDA) {#quick-start-nvidia-cuda}

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

إذا كانت أدوات الذكاء الاصطناعي تعمل على CPU رغم إعداد `--gpus all` وNVIDIA Container Toolkit بشكل صحيح، فأعد تثبيت الحزمة المتأثرة (مثل إزالة الخلفية) من **الإعدادات ← ميزات الذكاء الاصطناعي**. يستعيد المثبّت إصدار GPU من ONNX Runtime، الذي قد يحجبه إصدار CPU فقط جلبته حزمة أخرى (مثل النسخ الصوتي) في بيئة الذكاء الاصطناعي المشتركة. إذا لم تستعد إعادة التثبيت من الواجهة GPU على صورة أقدم، فراجع الإصلاح اليدوي في [المشكلة #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## متطلبات العتاد {#hardware-requirements}

تأتي هذه الأرقام من اختبارات أداء على مجموعة متنوعة من الأنظمة، من محطة عمل amd64 حديثة بمعالج رسومي NVIDIA RTX 4070 وصولًا إلى Raspberry Pi، مع تشغيل كامل كتالوج الأدوات على كل منها وتغيير حدود موارد Docker لإيجاد الحد الأدنى الفعلي.

هل تعمل على الطرف الأدنى من هذه الفئات (جهاز Pi، أو حاسوب محمول قديم، أو خادم VPS بذاكرة 2 GB)؟ يحوّل [إعدادات الموارد المحدودة](/ar/guide/low-resource) هذه الأرقام إلى شرح عملي ملموس مع حدود مضبوطة.

### مرجع سريع {#quick-reference}

| الفئة | حالة الاستخدام | CPU | RAM | GPU | التخزين |
|------|----------|-----|-----|-----|---------|
| الحد الأدنى | الأدوات غير المعتمدة على الذكاء الاصطناعي (الصور، الملفات، PDF الخفيف) مع OCR السريع المدمج وكشف الوجوه؛ مستخدم واحد؛ دفعات صغيرة | نواتان | 2 GB | لا يوجد | ~7 GB |
| الموصى به | الوسائط الخمس كلها بما فيها الفيديو وPDF وحزم الذكاء الاصطناعي القياسية على CPU؛ دفعات؛ عدة مستخدمين | 4 أنوية | 4 GB (8 GB للطلاء الداخلي عالي الجودة) | لا يوجد | ~25 GB |
| الكامل | كل شيء بالسرعة القصوى بما فيه الذكاء الاصطناعي على GPU؛ دفعات كبيرة؛ مستخدمون كثر | 6-8 أنوية | 8 GB | NVIDIA بذاكرة VRAM 8 GB أو أكثر (12 GB مريحة) | ~35 GB |

**البنية: 64 بت فقط** (`linux/amd64` أو `linux/arm64`). يعمل SnapOtter أصليًا على خوادم Intel/AMD وأجهزة Mac بمعالج Apple Silicon ولوحات ARM بـ 64 بت بما فيها **Raspberry Pi 4 و5** (4-8 GB). وهو **لا** يعمل على ARM بـ 32 بت (`armv7`/`armhf`) لأنه لا تُبنى صورة له، ولا على اللوحات من فئة 512 MB مثل Pi Zero، فهي دون الحد الأدنى للذاكرة (انظر أدناه).

### الحد الأدنى (أدوات الصور والملفات وPDF الخفيفة؛ بدون ذكاء اصطناعي) {#minimum-image-files-and-light-pdf-tools-no-ai}

| المورد | المتطلب |
|---|---|
| CPU | نواتان |
| RAM | 2 GB |
| القرص | ~5.5 GB (الصورة) + وحدة تخزين البيانات |
| GPU | غير مطلوب |

تعمل جميع أدوات الكتالوج غير المعتمدة على الذكاء الاصطناعي وعددها 222 على عتاد متواضع: الصور (تغيير الحجم، والقص، والتحويل، والضغط، والضبط، والعلامة المائية)، والفيديو (القص، وكتم الصوت، وإعادة التغليف)، والصوت (التحويل، والتسوية، والقص)، وPDF (الدمج، والتقسيم، والضغط، والتدوير، والحماية)، وتحويلات الملفات، والإعدادات المسبقة المخصصة للتحويل. تنتهي معظم العمليات في أقل بكثير من ثانية حتى مع الملفات الكبيرة: تُغيَّر أبعاد صورة بحجم 2.7 MB في نحو 0.05 ثانية وتُعاد ترميزها إلى WebP في نحو ثانيتين.

حد الذاكرة حقيقي، وفق اختبار تغيير حدود موارد Docker: **512 MB لا تكفي لتشغيل الحزمة** (حتى عملية تغيير حجم صورة واحدة تُقتل)، و**1 GB** تتعامل مع عمليات الملف الواحد لكن دفعة متعددة الملفات تنفد فيها الذاكرة، و**2 GB / نواتان** هي أصغر إعداد يتعامل مع الدفعات غير المعتمدة على الذكاء الاصطناعي بارتياح. كما أن OCR السريع المدمج وحزمة `face-detection` يتسعان ضمن 2 GB، بينما تحتاج حزم الذكاء الاصطناعي الأكبر (Whisper وLaMa/DDColor وrembg وRealESRGAN واستعادة الصور والطلاء الداخلي عالي الجودة SD1.5) إلى 4 حتى 8 GB من الذاكرة وتُرفض مسبقًا عندما تقل الذاكرة الحرة عن الحد الأدنى الخاص بكل حزمة.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**الاستثناء الوحيد الثقيل على CPU هو إعادة ترميز الفيديو.** عمليات نسخ التدفق (القص، وكتم الصوت، وإعادة تغليف الحاوية) فورية، لكن التحويل إلى ترميز مختلف يعتمد على CPU. يستغرق مقطع 1080p مدته 45 ثانية يُعاد ترميزه إلى VP9 (WebM) نحو **~40 ثانية** على CPU حديث سريع، ونحو 45 ثانية على Apple Silicon، ونحو 80 ثانية على جهاز محمول قديم بأربع أنوية، ونحو **~130 ثانية** على خادم قديم بأربع أنوية. إذا كان عملك يعتمد كثيرًا على الفيديو، فأعطِ الأولوية لعدد الأنوية وسرعة المعالج، أو ارفع حد `cpus:` للحاوية، فملف compose المرفق يحدد التطبيق بـ 4 أنوية افتراضيًا (8 في compose الخاص بـ GPU).

### الموصى به (أدوات الذكاء الاصطناعي على CPU) {#recommended-ai-tools-on-cpu}

| المورد | المتطلب |
|---|---|
| CPU | 4 أنوية |
| RAM | 4 GB |
| القرص | 3 GB (الصورة) + نحو 20 GB (جميع حزم الذكاء الاصطناعي الاختيارية) + مساحة العمل |
| GPU | غير مطلوب (بديل CPU) |

**تثبيت حزم الذكاء الاصطناعي الأكبر وتشغيلها هو ما يرفع التوصية إلى 4 GB من الذاكرة.** عند عدم تثبيت أي حزم اختيارية يستهلك التطبيق نحو 360 MB في وضع الخمول. تتشارك أدوات Python القديمة عملية جانبية واحدة، بينما يستخدم OCR الدقيق موزّعًا مخصصًا طويل العمر مثبّتًا على الجيل الثابت النشط. قبل التفعيل، يجري المثبّت اختبار دخان على المرشح. ثم ينتقل بشكل ذري إلى الموزّع الجديد ويستنزف الموزّع السابق قبل تنظيف الذاكرة. يجب أن يجتاز كل مكوّن OCR دقيق رسمي مجموعة اختبارات أسوأ الحالات للإصدار ضمن cgroup بحجم 4 GiB، بينما تترك توصية المضيف البالغة 4 GB هامشًا لتطبيق Node.js وPostgres وRedis وقوائم الانتظار والأعمال المتزامنة.

معظم أدوات الذكاء الاصطناعي قابلة للاستخدام تمامًا على CPU؛ وأداتان أو ثلاث تحتاج فعلًا إلى GPU. القياسات على CPU حديث بأربع أنوية:

| أداة الذكاء الاصطناعي | زمن CPU | هل هي قابلة للاستخدام على CPU؟ |
|---|---|---|
| كشف الوجوه (blur-faces وsmart-crop وred-eye) وإزالة الضوضاء | أقل من ثانية | نعم |
| OCR والنسخ الصوتي والترجمات النصية | 1-3 ثوانٍ | نعم |
| التلوين، وتحسين الوجوه | ~10 ثوانٍ | نعم |
| إزالة الخلفية / استبدالها / تمويهها | ~29 ثانية | نعم (ستنتظر) |
| تكبير الذكاء الاصطناعي (RealESRGAN) | ~33 ثانية للصغيرة؛ دقائق للصور الكبيرة | حدّي، ويوصى بشدة باستخدام GPU |
| استعادة الصور (خط المعالجة الكامل) | عدة دقائق | لا، تحتاج إلى GPU أو CPU سريع متعدد الأنوية |

لا يضمّن SnapOtter عمدًا تنزيلات هذه النماذج في صورة Docker. تُسحب حزم الذكاء الاصطناعي فقط عندما يفعّل مسؤول الأداة المرتبطة بها، وتُخزَّن في وحدة التخزين الدائمة `/data/ai`، وتُشارَك بين كل الأدوات التي تعتمد على حزمة النماذج نفسها. هذا يُبقي صورة الحاوية النهائية صغيرة مع إتاحة أن يصل التثبيت الكامل للذكاء الاصطناعي إلى أرقام التخزين الأكبر أدناه.

تعتمد بعض الأدوات على أكثر من حزمة مشتركة واحدة. فمثلًا تحتاج أداة صورة جواز السفر إلى `background-removal` و`face-detection` معًا؛ وإذا كانت `background-removal` مثبتة بالفعل، فإن تفعيل أداة صورة جواز السفر لا ينزّل إلا حزمة `face-detection` المفقودة. ينطبق إعادة الاستخدام نفسها على جميع أدوات الذكاء الاصطناعي.

مساحة تخزين حزم الذكاء الاصطناعي الاختيارية وحدود ذاكرة CPU الدنيا (يتحقق SnapOtter من الذاكرة المتاحة قبل الإرسال إلى العملية الجانبية لـ Python ويرفض فورًا التشغيل الذي يقل عن حد الذاكرة الحرة للحزمة):

| الحزمة | حجم القرص | الحد الأدنى لذاكرة CPU |
|---|---|---|
| كشف الوجوه | 200-300 MB | ذاكرة مضيف 2 GB (~0.5 GB حرة) |
| النسخ الصوتي | ~600 MB | ذاكرة مضيف 4 GB (~2 GB حرة) |
| ممحاة العناصر + التلوين | 1-2 GB | ذاكرة مضيف 4 GB (~2 GB حرة) |
| OCR الدقيق (`balanced`/`best`) | ~208-234 MiB تنزيل / ~409-488 MiB بعد التثبيت | 4 GiB ذاكرة فعالة مضبوطة (يعمل `fast` على 2 GB) |
| إزالة الخلفية | 4-5 GB | ذاكرة مضيف 4 GB (~2.5 GB حرة) |
| التكبير + تحسين الوجوه + إزالة الضوضاء | 5-6 GB | ذاكرة مضيف 4 GB (~2.5 GB حرة) |
| استعادة الصور | 4-5 GB | ذاكرة مضيف 4 GB (~3 GB حرة) |
| الطلاء الداخلي عالي الجودة (`inpaint-hq`) | 5-7 GB | ذاكرة مضيف 8 GB (~6 GB حرة) |
| **جميع الحزم** | **~25 GB بعد التثبيت** | **4 GB (8 GB مع `inpaint-hq`)** |

OCR السريع مدمج في الصورة عبر Tesseract، ويضيف نحو 25 MiB، ولا يتطلب حزمة OCR الاختيارية ولا متطلب ذاكرتها البالغ 4 GiB. يدعم OCR السريع `auto` و`en` و`de` و`es` و`fr` و`zh` و`ja`، ولا يدعم الكورية (`ko`) ولا العربية (`ar`). كلتاهما تستخدم `balanced` أو `best` ولذلك تتطلبان الحزمة الدقيقة. الحزمة الدقيقة متاحة في حاويات Linux الرسمية amd64 وarm64 وتشغّل ONNX Runtime على CPU. وتستخدم مضيفات NVIDIA بيئة تشغيل OCR نفسها على CPU، لذا لا يعتمد OCR على إصدار CUDA ولا على بنية GPU. تتطلب بيئة التشغيل الدقيقة ما لا يقل عن 4 GiB من الذاكرة الفعالة: حد cgroup المضبوط للحاوية، وإلا ذاكرة المضيف. يرفض SnapOtter الأنظمة التي تقل عن هذا الحد الأدنى الموقّع للتوافق قبل تنزيل الحزمة. كما يُرفض تثبيت الحزمة الدقيقة على الأرشيفات الجاهزة أو المثبتة على نظام مباشر (bare-metal) التي لا يمكن ضمان توافق libc وواجهة Python الثنائية (ABI) فيها. على هذه المضيفات غير المدعومة، تعيد معالجة OCR للكورية والعربية خطأ عدم توافق صريحًا ولا تعود أبدًا بصمت إلى OCR السريع. وأي طلب صريح لـ OCR السريع بالكورية يعيد `FEATURE_INCOMPATIBLE` مع السبب `fast-korean-unsupported` قبل وضع المهمة في قائمة الانتظار.

يجب أن تستخدم النسخ المتماثلة التي تتشارك `DATA_DIR` نفسه بنية CPU نفسها؛ ثبّت عمليات النشر متعددة النسخ باستخدام تقارب العقد (node affinity). تحتاج النسخ المتماثلة المختلطة amd64/arm64 إلى وحدات تخزين بيانات منفصلة وعمليات نشر مستقلة من SnapOtter.

تحتفظ بيئة التشغيل الدقيقة بجيل نشط واحد وتمسح ذاكرة التنزيل المؤقتة بعد التفعيل. في هذا الإصدار، يحتاج أول تثبيت مؤقتًا إلى نحو 620-720 MiB للأرشيف والتجهيز، وقد تصل الذروة عند الترقية إلى نحو 1.2 GiB بينما يبقى الجيل القديم نشطًا. يحسب المثبّت المتطلب الدقيق من الفهرس الموقّع والأجيال الحالية قبل التنزيل أو الاستخراج، ويفشل مبكرًا إذا كانت وحدة تخزين البيانات صغيرة جدًا.

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
| GPU | NVIDIA بذاكرة VRAM 8 GB أو أكثر (يوصى بـ 12 GB) |
| القرص | ~35 GB إجمالًا |

يسرّع معالج NVIDIA الرسومي (CUDA) نماذج الذكاء الاصطناعي الثقيلة تسريعًا كبيرًا. القياسات على RTX 4070 مقابل CPU حديث:

| أداة الذكاء الاصطناعي | التسريع مع GPU | ملاحظات |
|---|---|---|
| تكبير الذكاء الاصطناعي (RealESRGAN 2×) | **~47×** | أكبر مكسب، أقل من ثانية مقابل ~33 ثانية (دقائق للصور الكبيرة) |
| تحسين الوجوه (CodeFormer) | **~12×** | ~0.9 ثانية مقابل ~11 ثانية |
| النسخ الصوتي (Whisper) | ~4.5× | |
| إزالة الخلفية / استبدالها / تمويهها | ~4× | ~7 ثوانٍ على GPU مقابل ~29 ثانية على CPU |
| التلوين | ~1.8× | |
| OCR وكشف الوجوه وإزالة العين الحمراء وإزالة الضوضاء | ~1× | سريعة أصلًا على CPU، ولا يفيد GPU |
| استعادة الصور | لا يوجد | مقيّدة بـ CPU حتى مع GPU (استخدام GPU بنسبة 0%)؛ يهم CPU السريع هنا أكثر من GPU |

الأدوات التي تستحق GPU هي **التكبير، وتحسين الوجوه، والنسخ الصوتي، وإزالة الخلفية**. أما كشف الوجوه وOCR وإزالة العين الحمراء فمقيّدة بـ CPU وسريعة أصلًا، لذا لا يضيف GPU شيئًا.

يصل الاستخدام الأقصى لـ VRAM إلى 7.5 GB أثناء التكبير مع تحسين الوجوه. يعمل معالج NVIDIA الرسومي بذاكرة 6 GB مع معظم أدوات الذكاء الاصطناعي كلًا على حدة لكنه يفشل في التكبير. تتعامل ذاكرة VRAM من 8 إلى 12 GB مع كل شيء.

تسريع المعالج الرسومي المدمج من Intel/AMD عبر VA-API أو Quick Sync أو OpenCL غير مدعوم حاليًا لاستدلال الذكاء الاصطناعي. إن ربط `/dev/dri` داخل الحاوية لا يفعّل تسريع GPU للذكاء الاصطناعي؛ سيشغّل SnapOtter أدوات الذكاء الاصطناعي على CPU ما لم يتوفر NVIDIA CUDA.

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

طلبات تغيير حجم الصور المتوازية على حاوية التطبيق الافتراضية المحدودة بـ 4 أنوية:

| الطلبات المتزامنة | متوسط زمن الاستجابة | الأخطاء |
|---|---|---|
| 1 | 0.4 ث | 0 |
| 5 | 1.2 ث | 0 |
| 10 | 2.1 ث | 0 |

يتدهور زمن الاستجابة بصورة شبه خطية دون أخطاء مع تشبع مجموعة العمال. رفع حد `cpus:` لحاوية التطبيق (أو استخدام مضيف بأنوية أكثر) يرفع السقف. لاحظ أن المهام الثقيلة (تحويل ترميز الفيديو، والذكاء الاصطناعي على CPU) تحتجز عاملًا طوال مدتها، لذا حدّد حجم CPU وفق عدد المهام الثقيلة المتزامنة المتوقعة لا وفق عدد الطلبات فقط.

### صيغ الصور المدعومة {#supported-image-formats}

يدعم SnapOtter أكثر من **55 صيغة إدخال** و**14 صيغة إخراج**، بما فيها ملفات RAW من أكثر من 20 علامة كاميرا، والصيغ الاحترافية (PSD وEPS وOpenEXR وHDR)، والترميزات الحديثة (JPEG XL وAVIF وHEIC وQOI)، والصيغ العلمية وصيغ الألعاب (FITS وDDS).

راجع [القائمة الكاملة للصيغ](/ar/guide/supported-formats) لمعرفة تفاصيل كل صيغة مدعومة، ومفكك الترميز المستخدم، وعناصر التحكم بالجودة المتاحة.

### القيود المعروفة {#known-limitations}

- **تغيير الحجم الواعي بالمحتوى** يتعطل مع الصور الكبيرة (>5 MP) بسبب قيد في الملف الثنائي caire. يعمل جيدًا مع الصور الأصغر.
- **فك ترميز HEIF** يستغرق 13-23 ثانية. أما HEIC (صيغة Apple) فأسرع بكثير: 0.3-0.9 ثانية.
- **التكبير** تنتهي مهلته على CPU لأي صورة تتجاوز الصور الصغيرة. يلزم GPU للاستخدام العملي.
- **تحسين الوجوه بـ CodeFormer** أبطأ بكثير من GFPGAN (53 ثانية مقابل 2 ثانية على GPU). يوصى بـ GFPGAN لمعظم حالات الاستخدام.

## وحدات التخزين {#volumes}

| نقطة الربط / وحدة التخزين | الغرض | هل هي مطلوبة؟ |
|---|---|---|
| `/data` (التطبيق) | نماذج الذكاء الاصطناعي، وبيئة Python الافتراضية، وملفات المستخدم | **نعم** - فقدان الملفات من دونها |
| `/tmp/workspace` (التطبيق) | ملفات المعالجة المؤقتة (تُنظَّف تلقائيًا) | موصى بها |
| `SnapOtter-pgdata` (postgres) | دليل بيانات PostgreSQL (المستخدمون، والإعدادات، وخطوط المعالجة، والمهام) | **نعم** - فقدان البيانات من دونها |
| `SnapOtter-redisdata` (redis) | ملف Redis للإلحاق فقط لقوائم انتظار مهام دائمة | موصى بها |

### نقاط الربط مقابل وحدات التخزين المسماة {#bind-mounts-vs-named-volumes}

**وحدات التخزين المسماة** (موصى بها): يدير Docker الأذونات تلقائيًا:
```yaml
volumes:
  - SnapOtter-data:/data
```

**نقاط الربط (Bind mounts)**: أنت تدير الأذونات. اضبط `PUID`/`PGID` لتطابق مستخدم المضيف لديك:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### أذونات التخزين {#storage-permissions}

يكتب SnapOtter في موقعين أثناء التشغيل: `/data` (ملفات المستخدم، والسجلات، ونماذج الذكاء الاصطناعي، وبيئة Python الافتراضية) و`/tmp/workspace` (مساحة المعالجة المؤقتة). يجب أن يكون كلاهما قابلًا للكتابة من المستخدم الذي تعمل الحاوية بصفته. إذا لم يكن أحدهما كذلك، **تفشل الحاوية سريعًا عند بدء التشغيل** برسالة تسمّي الدليل، وUID/GID الجاري، وطريقة الإصلاح، بدلًا من أن تقلع "سليمة" ثم تفشل عند أول عملية رفع برسالة غامضة. يُفحص دليل السجلات (`LOG_DIR`، و`/data/logs` في الصورة) بالطريقة نفسها، في كل أوضاع التخزين، لأن السجلات تبقى محلية حتى لو كانت الملفات في S3.

تعتمد طريقة التعامل مع الأذونات على طريقة تشغيل الحاوية:

**الافتراضي (يبدأ كـ root ثم يتخلى إلى `snapotter`)**: تبدأ نقطة الدخول كـ root، وتصلح ملكية وحدات التخزين المركّبة، ثم تتخلى إلى المستخدم غير المميّز `snapotter` عبر `gosu`. تعمل وحدات التخزين المسماة دون أي إعداد. بالنسبة لنقاط الربط، اضبط `PUID`/`PGID` على مستخدم المضيف لديك (أعلاه) لتكون الملفات التي يكتبها مملوكة لك.

**Kubernetes / OpenShift (غير root عبر `runAsUser`)**: عند التشغيل مباشرة بمستخدم غير root، لا تستطيع الحاوية تغيير ملكية وحدات التخزين بنفسها، لذا يجب على المنسّق جعلها قابلة للكتابة. اضبط `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

الأدلة القابلة للكتابة في الصورة مملوكة للمجموعة GID 0 وقابلة للكتابة من المجموعة، لذا يستطيع pod يعمل بـ **UID عشوائي** مع مجموعة root التكميلية (الافتراضي في OpenShift) الكتابة دون `chown`.

**TrueNAS Scale (وإعدادات "UID الغريب" الأخرى)**: يشغّل TrueNAS التطبيقات بمستخدم غير root (غالبًا `568:568`) ويركّب مجموعات بيانات المضيف المملوكة لمستخدم مختلف، لذا لا تجعلها نقطة الدخول ولا `fsGroup` قابلة للكتابة بمفردها. اختر أحد الحلول:

- **شغّل التطبيق كـ root** (موصى به): اترك مستخدم التطبيق غير مضبوط أو اضبطه على `0`، ودع نقطة الدخول الافتراضية تصلح الأذونات وتتخلى إلى `snapotter`.
- **شغّل بـ UID `999`**: اضبط مستخدم التطبيق/مجموعته على `999:999` (مستخدم SnapOtter المدمج `snapotter`) ليطابق ملكية الصورة.
- **`chown` لمجموعة بيانات المضيف** إلى UID الذي تعمل الحاوية به، من صدفة TrueNAS:

  ```bash
  # استخدم UID من خطأ بدء التشغيل (أو شغّل `id` داخل الحاوية)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

يسمّي خطأ بدء التشغيل الـ UID المطلوب بدقة، لذا فأسرع طريق هو تشغيل التطبيق مرة واحدة، وقراءة الرسالة، ثم `chown` (أو تعديل المستخدم) وفقًا لذلك.

## متغيرات البيئة {#environment-variables}

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `AUTH_ENABLED` | `true` | تفعيل/تعطيل اشتراط تسجيل الدخول |
| `DEFAULT_USERNAME` | `admin` | اسم مستخدم المسؤول الأولي |
| `DEFAULT_PASSWORD` | `admin` | كلمة مرور المسؤول الأولية (يُفرض تغييرها عند أول تسجيل دخول) |
| `MAX_UPLOAD_SIZE_MB` | `0` (غير محدود) | حد الرفع لكل ملف بوحدة MB. تأتي الصورة بالقيمة `0`؛ وتبدأ النسخة المبنية من المصدر عند 100 |
| `MAX_BATCH_SIZE` | `0` (غير محدود) | الحد الأقصى للملفات في طلب الدفعة الواحد. تأتي الصورة بالقيمة `0`؛ وتبدأ النسخة المبنية من المصدر عند 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | طلبات API في الدقيقة لكل عنوان IP (اضبطه على 0 للتعطيل) |
| `MAX_USERS` | `0` (غير محدود) | الحد الأقصى لحسابات المستخدمين |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | الأقران المسموح لهم بتحديد عنوان IP للعميل عبر `X-Forwarded-For`. الشبكات الخاصة فقط افتراضيًا |
| `PUID` | `999` | التشغيل بهذا UID (لأذونات نقاط الربط) |
| `PGID` | `999` | التشغيل بهذا GID (لأذونات نقاط الربط) |
| `LOG_LEVEL` | `info` | مستوى تفصيل السجلات: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (تلقائي) | الحد الأقصى لمهام معالجة الذكاء الاصطناعي المتوازية |
| `SESSION_DURATION_HOURS` | `168` | مدة صلاحية جلسة تسجيل الدخول (7 أيام) |
| `CORS_ORIGIN` | (فارغ) | الأصول المسموح بها مفصولة بفواصل، أو فارغ للأصل نفسه فقط |

### الوكيل الصادر وهيئة التصديق الخاصة {#outbound-proxy-and-private-ca}

تفعّل الحاوية الرسمية دعم الوكيل عبر البيئة في Node. إذا كان على SnapOtter الوصول إلى مستودع بيئة تشغيل OCR أو خدمات HTTPS أخرى عبر وكيل مؤسسي، فاضبط `HTTPS_PROXY` (و`HTTP_PROXY` عند الحاجة). اضبط `NO_PROXY` على قائمة مفصولة بفواصل من المضيفات التي يجب الوصول إليها مباشرة، مثل Postgres وRedis وتخزين الكائنات الداخلي.

إذا كان الوكيل أو إحدى الخدمات الداخلية موقّعة من هيئة تصديق خاصة، فركّب شهادة الهيئة للقراءة فقط ووجّه `NODE_EXTRA_CA_CERTS` إليها. يجب أن يكون الملف موجودًا عند بدء عملية Node:

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

أبقِ بيانات اعتماد الوكيل خارج ملف Compose (مثلًا في ملف `.env` محمي أو في secret). لا تعطّل التحقق من TLS: الفهرس الموقّع لـ OCR يصادق على بيانات الإصدار الوصفية، بينما يظل التحقق العادي من TLS يحمي النقل وكل طلب صادر آخر.

## فحص السلامة {#health-check}

تتضمن الحاوية فحص سلامة مدمجًا:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## الوكيل العكسي {#reverse-proxy}

`TRUST_PROXY` قيمته الافتراضية `loopback,linklocal,uniquelocal`، لذا لا يصدّق SnapOtter `X-Forwarded-For` إلا من قرين على شبكة خاصة. الوكيل العكسي على المضيف نفسه، أو على شبكة Docker، أو على شبكتك المحلية، موثوق به مباشرة، ما يعني أن تحديد المعدل ومحدّد القوة الغاشمة لتسجيل الدخول وسجل التدقيق وقائمة السماح بعناوين IP في الإصدار المؤسسي كلها ترى عنوان IP الحقيقي للعميل دون أي إعداد.

اضبط `TRUST_PROXY=true` فقط عندما يصل الوكيل الذي في المقدمة إلى SnapOtter من عنوان **عام**، مثل موازن حمل سحابي على شبكة مختلفة. في نسخة معرضة مباشرة، تجعل هذه القيمة `request.ip` تحت سيطرة المهاجم، لأن المستدعي الذي يبدّل الترويسة يحصل على سلة تحديد معدل جديدة في كل طلب.

أمران يجب معرفتهما قبل أن تقيس عناوين IP للعملاء. يخدم Docker Desktop على macOS وWindows المنفذ المنشور عبر وكيل في فضاء المستخدم يعيد كتابة كل عنوان مصدر إلى بوابة الجهاز الافتراضي `192.168.65.1`، فلا تستعيد أي قيمة لـ `TRUST_PROXY` العميل الحقيقي هناك؛ انشر على Linux لأي شيء مكشوف على الإنترنت. وعلى أي منصة، يُلاحَظ الوصول إلى منفذ منشور عبر `localhost` على أنه بوابة الجسر لا عميلك، لذا لا يخبرك اختبار localhost بشيء عن كيفية نسب العميل الحقيقي. الجدول الكامل لقيم `TRUST_PROXY` وتنبيه Docker Desktop موجودان في [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

أمران مهمان لكل وكيل أدناه: اسمح بأجسام طلبات كبيرة (الرفع)، ولا تُخزّن الاستجابات مؤقتًا. الوكيل الذي يخزّن الاستجابات مؤقتًا يكسر تقدم SSE، والأوضح من ذلك أنه يجعل تنزيل ملف كبير "يبدأ ولا ينتهي"، لأن الوكيل يحتفظ بالملف كاملًا قبل تمريره. يرسل SnapOtter `X-Accel-Buffering: no` عند التنزيلات كي يبث nginx الملفات حتى لو كان التخزين المؤقت مفعّلًا في مكان آخر، لكن الوكلاء غير nginx يحتاجون إلى تعطيل تخزين الاستجابات مؤقتًا صراحةً (يظهر في كل إعداد أدناه). إذا توقف التنزيل في منتصفه، فوكيل يخزّن مؤقتًا في المقدمة هو أول ما يجب فحصه.

ملاحظة حول HSTS: ترسل API الترويسة `Strict-Transport-Security` في كل استجابة بنفسها، لذا فالوكيل الذي يمرر ترويسات الاستجابة (وكل الإعدادات أدناه تفعل ذلك) لا يحتاج إلى أي إعداد HSTS خاص به. فقط إذا كان الوكيل مضبوطًا على إزالة ترويسات الاستجابة الصادرة من المنبع أو استبدالها، فعليك الحفاظ على الترويسة أو إعادة إضافتها عند الحافة.

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

للخدمة على `https://example.com/snapotter`، اضبط `BASE_PATH=/snapotter` في
بيئة حاوية SnapOtter وأعد تشغيلها. تقبل ملفات Compose الرسمية لـ CPU وGPU
أيضًا `BASE_PATH` من الصدفة لديك أو من ملف Compose `.env`. الصورة نفسها
تعمل على أي مسار؛ ولا حاجة إلى إعادة بناء الواجهة الأمامية.

يقبل `BASE_PATH` مقاطع مفصولة بشرطة مائلة تحتوي على أحرف وأرقام و`_` أو
`-`، بما في ذلك المسارات المتداخلة مثل `/apps/snapotter`. الشرطة المائلة الأخيرة
اختيارية. اتركه فارغًا (الافتراضي)، أو اضبطه على `/`، للنشر في الجذر.

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
التمرير مدعومون أيضًا. يمكن لفحوصات السلامة الداخلية الاستمرار في استخدام
`/api/v1/health`. بالنسبة إلى OIDC أو SAML، اضبط أيضًا
`EXTERNAL_URL=https://example.com/snapotter` وحدّث عناوين
رد النداء لدى موفر الهوية لتتضمن `/snapotter/api/auth/oidc/callback` أو
`/snapotter/api/auth/saml/callback` على التوالي.

تستمر نصوص API البرمجية في العمل دون تغيير: عناوين URL في استجابات API، مثل
`downloadUrl` لأداة ما، تبدأ بـ `/api/` أيًّا كان `BASE_PATH`. أضِفها إلى عنوان URL
الأساسي لنسختك (`https://example.com/snapotter` + `/api/v1/download/...`)
بدلًا من حلّها مقابل جذر النطاق.

افتح الواجهة عبر عنوان URL ذي البادئة (`https://example.com/snapotter`). يُوجَّه
المتصفح الذي يصل دون البادئة إليها تلقائيًا؛ ويُتوقع أن تصل طلبات API فقط
إلى التطبيق دون بادئة. إذا قالت السجلات
`Requests arrive under /snapotter/ but BASE_PATH is empty`، فإن الوكيل لديك
يمرر بادئة لا يعلنها `BASE_PATH`: اضبط `BASE_PATH` عليها،
أو أزل البادئة عند الوكيل.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. أضف مضيف وكيل جديدًا (Proxy Host)
2. اضبط Domain Name على نطاقك
3. اضبط Scheme على `http`، وForward Hostname على `SnapOtter` (أو عنوان IP للحاوية)، وForward Port على `1349`
4. فعّل دعم WebSocket
5. ضمن Advanced، أضف: `client_max_body_size 500M;` و`proxy_buffering off;`

تمر ترويسة `Strict-Transport-Security` الخاصة بـ API عبر NPM كما هي؛ ومفتاح HSTS في تبويب SSL اختياري إضافةً إليها.

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

يمرر Traefik ترويسات الاستجابة الصادرة من المنبع دون تغيير، لذا تصل ترويسة `Strict-Transport-Security` الخاصة بـ API إلى المتصفحات دون وسيط `headers`. إذا كنت تشغّل أصلًا وسيطًا يعيد كتابة ترويسات الاستجابة، فتأكد من أنه يترك تلك الترويسة سليمة.

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

`flush_interval -1` يعطّل تخزين الاستجابة مؤقتًا، وهو مطلوب لأحداث تقدم SSE (معالجة الدفعات، وأدوات الذكاء الاصطناعي، وتثبيت الميزات) ولكي تُبث تنزيلات الملفات الكبيرة بدلًا من أن تتعطل. تتيح المهل الممتدة إكمال رفع الملفات الكبيرة دون أن يغلق Caddy الاتصال مبكرًا. كما يمرر Caddy ترويسة `Strict-Transport-Security` الخاصة بـ API دون مساس، فلا حاجة إلى توجيه `header` لـ HSTS.

### أنفاق Cloudflare {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

ملاحظة: لدى Cloudflare حد رفع قدره 100 MB في الخطط المجانية. اضبط `MAX_UPLOAD_SIZE_MB=100` ليتوافق مع ذلك.

يمرر النفق ترويسات استجابة API، بما فيها `Strict-Transport-Security`، فلا حاجة إلى إعداد HSTS في لوحة التحكم (إعداد HSTS في حافة Cloudflare نفسها اختياري إضافةً إلى ذلك).

## استكشاف الأخطاء وإصلاحها {#troubleshooting}

### "Postgres not reachable: EAI_AGAIN" مباشرة بعد فشل أول تشغيل {#eai-again-after-failed-first-start}

إذا فشل أول `docker compose up -d` في منتصفه (والسبب المعتاد منفذ مستخدم بالفعل)، فإن إعادة المحاولة العادية بـ `up -d` قد تشغّل حاوية التطبيق دون ربطها بشبكة compose. عندها يدخل التطبيق في حلقة تعطل مع:

```
Postgres not reachable: EAI_AGAIN
```

بينما يُظهر `docker ps` أن postgres سليم. الخطأ حقيقي لكنه يشير إلى الحاوية الخطأ: فبدون الشبكة لا يمكن حل DNS لاسم المضيف `postgres` إطلاقًا، وتعيد سياسة إعادة التشغيل الفشل نفسه إلى ما لا نهاية.

أصلح ما تعطل في أول تشغيل (غالبًا: حرّر المنفذ)، ثم أجبر على إعادة إنشاء حاوية التطبيق لتعيد الاتصال بالشبكة:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: يمكن الوصول إليه من أجهزة أخرى، لا من الحاسوب نفسه {#windows-wsl2-loopback}

عند تشغيل Docker داخل WSL2 (الإعداد المعتاد في Windows)، قد تكون الحزمة متاحة من كل جهاز آخر على شبكتك بينما تنتهي مهلة `http://localhost:1349` على مضيف Windows نفسه، حتى مع تفعيل وضع الشبكات المعكوسة في WSL. لا يظهر المنفذ في `netstat` على Windows، ولا عطل في الحاويات.

افتح التطبيق من جهاز آخر، أو من داخل التوزيعة باستخدام عنوانها الخاص (`hostname -I` في صدفة WSL). إذا نجح تمرير localhost في إصدار WSL لديك، فاعتبره ميزة إضافية لا شيئًا يُعتمد عليه.

## CI/CD {#ci-cd}

يضم مستودع GitHub ثلاثة مسارات عمل:

- **ci.yml** - يعمل تلقائيًا مع كل دفع وPR. يجري الفحص بـ lint، والتحقق من الأنواع، والاختبارات، والبناء، ويتحقق من صورة Docker (دون دفعها).
- **release.yml** - يُشغَّل يدويًا عبر `workflow_dispatch`. يشغّل semantic-release لإنشاء وسم إصدار وإصدار على GitHub، ثم يبني صورة Docker متعددة البنى (amd64 + arm64) ويدفعها إلى Docker Hub (`snapotter/snapotter`) وإلى GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - يبني موقع التوثيق هذا وينشره على Cloudflare Pages عند الدفع إلى `main`.

لإنشاء إصدار، انتقل إلى **Actions > Release > Run workflow** في واجهة GitHub، أو شغّل:

```bash
gh workflow run release.yml
```

يحدد semantic-release الإصدار من سجل الإيداعات. يشير وسم Docker `latest` دائمًا إلى أحدث إصدار.

## التحليلات {#analytics}

يتضمن SnapOtter تحليلات منتج مجهولة (أنماط استخدام الأدوات، وتقارير الأخطاء) للمساعدة في اكتشاف الأخطاء وتحسين الميزات. وهي مفعّلة افتراضيًا. ملفاتك وأسماؤها وبياناتك الشخصية ليست جزءًا منها أبدًا. يعمل SnapOtter بشكل طبيعي مع تعطيل التحليلات.

### تعطيل التحليلات {#disabling-analytics}

إلغاء الاشتراك أثناء التشغيل هو مفتاح تبديل بنقرة واحدة للمسؤول. افتح الإعدادات > النظام > الخصوصية وأوقف تحليلات المنتج المجهولة. يتوقف ذلك فورًا للنسخة بأكملها دون الحاجة إلى إعادة بناء.

للحصول على صورة لا يمكنها إصدار تحليلات أبدًا، اضبط الإيقاف الدائم وقت البناء باستنساخ المستودع وإعادة البناء:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

أو أضف معامل البناء إلى `docker-compose.yml` الحالي لديك:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
