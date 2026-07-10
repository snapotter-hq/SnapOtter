---
description: "انشر SnapOtter إلى الإنتاج باستخدام Docker. متطلبات العتاد، وإعداد GPU، وإعدادات الوكيل العكسي لـ Nginx وTraefik وCloudflare."
i18n_source_hash: ecc1b528bc4b
i18n_provenance: human
i18n_output_hash: 5eff514dfd19
---

# النشر {#deployment}

يُنشَر SnapOtter كحزمة Docker Compose من 3 حاويات: صورة تطبيق SnapOtter، وPostgreSQL 17، وRedis 8. تدعم صورة التطبيق **linux/amd64** (مع NVIDIA CUDA لتسريع الذكاء الاصطناعي) و**linux/arm64** (وحدة معالجة مركزية CPU)، لذا تعمل بشكل أصيل على خوادم Intel/AMD، وأجهزة Mac بمعالج Apple Silicon، وأجهزة ARM مثل Raspberry Pi 4/5. تسريع iGPU من Intel/AMD عبر VA-API أو Quick Sync أو OpenCL غير مدعوم لاستدلال الذكاء الاصطناعي حاليًا.

انظر [صورة Docker](./docker-tags) لإعداد GPU، وأمثلة Docker Compose، وتثبيت الإصدارات.

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=true         # Trust X-Forwarded-For headers (set false if not behind a proxy)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)
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
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
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

يصبح التطبيق بعدها متاحًا على `http://localhost:1349`.

> **حدود معدل Docker Hub؟** استبدل `snapotter/snapotter:latest` بـ `ghcr.io/snapotter-hq/snapotter:latest` للسحب من GitHub Container Registry بدلًا من ذلك. يتلقى كلا السجلَّين الصورة نفسها في كل إصدار.

## البدء السريع (NVIDIA CUDA) {#quick-start-nvidia-cuda}

لتسريع NVIDIA CUDA على أدوات الذكاء الاصطناعي (إزالة الخلفية، والتكبير، وتحسين الوجوه، وOCR):

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
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

تحقق من اكتشاف CUDA في السجلات:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## متطلبات العتاد {#hardware-requirements}

تأتي هذه الأرقام من قياسات أداء على مجموعة من الأنظمة، من محطة عمل amd64 حديثة مزوّدة بـ NVIDIA RTX 4070 نزولًا إلى Raspberry Pi، مع تشغيل كامل كتالوج الأدوات على كل منها وتغيير حدود موارد Docker للعثور على الحد الأدنى الفعلي.

### مرجع سريع {#quick-reference}

| المستوى | حالة الاستخدام | CPU | RAM | GPU | التخزين |
|------|----------|-----|-----|-----|---------|
| الحد الأدنى | أدوات الصور والملفات وأدوات PDF الخفيفة؛ مستخدم واحد؛ دفعات صغيرة | نواتان | 2 GB | لا شيء | ~7 GB |
| الموصى به | جميع الوسائط الخمس بما في ذلك الفيديو وPDF والذكاء الاصطناعي على CPU؛ دفعات؛ عدد قليل من المستخدمين | 4 أنوية | 4 GB | لا شيء | ~25 GB |
| الكامل | كل شيء بسرعة بما في ذلك الذكاء الاصطناعي على GPU؛ دفعات كبيرة؛ العديد من المستخدمين | 6-8 أنوية | 8 GB | NVIDIA بذاكرة VRAM سعة 8 GB+ (12 GB مريح) | ~35 GB |

**المعمارية: 64 بت فقط** (`linux/amd64` أو `linux/arm64`). يعمل SnapOtter بشكل أصيل على خوادم Intel/AMD، وأجهزة Mac بمعالج Apple Silicon، ولوحات ARM بنظام 64 بت بما في ذلك **Raspberry Pi 4 و5** (4-8 GB). لا يعمل على ARM بنظام 32 بت (`armv7`/`armhf`)، إذ لا تُبنى له أي صورة، ولا على لوحات من فئة 512 ميغابايت مثل Pi Zero، التي تقع تحت الحد الأدنى للذاكرة (انظر أدناه).

### الحد الأدنى (أدوات الصور والملفات وأدوات PDF الخفيفة؛ بلا ذكاء اصطناعي) {#minimum-image-files-and-light-pdf-tools-no-ai}

| المورد | المتطلب |
|---|---|
| CPU | نواتان |
| RAM | 2 GB |
| القرص | ~5.5 GB (الصورة) + وحدة تخزين البيانات |
| GPU | غير مطلوب |

جميع أدوات الكتالوج الـ 222 غير المعتمِدة على الذكاء الاصطناعي، من الصور (تغيير الحجم، والقص، والتحويل، والضغط، والتعديل، والعلامة المائية)، والفيديو (القص، وكتم الصوت، وإعادة التعبئة remux)، والصوت (التحويل، والتطبيع، والقص)، وPDF (الدمج، والتقسيم، والضغط، والتدوير، والحماية)، وتحويلات الملفات، وإعدادات التحويل المخصّصة، تعمل على عتاد متواضع. تنتهي معظم العمليات في أقل بكثير من ثانية حتى على ملف كبير: تُغيَّر صورة بحجم 2.7 MB في نحو 0.05 ثانية وتُعاد ترميزها إلى WebP في نحو ثانيتين.

الحد الأدنى للذاكرة حقيقي، بناءً على تغيير حد موارد Docker: **لا يمكن لـ 512 MB بدء الحزمة** (حتى تغيير حجم صورة واحد يُنهَى قسرًا)، بينما تتعامل **1 GB** مع عمليات الملف الواحد لكن الدفعة متعددة الملفات تنفد ذاكرتها، و**2 GB / نواتان** هو أصغر إعداد يتعامل مع الدفعات بشكل مريح.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**الاستثناء الوحيد الثقيل على CPU هو إعادة ترميز الفيديو.** عمليات نسخ التدفق (القص، وكتم الصوت، وإعادة تعبئة الحاوية) فورية، لكن التحويل الترميزي إلى ترميز مختلف يعتمد على CPU. مقطع 1080p / 45 ثانية يُعاد ترميزه إلى VP9 (WebM) يستغرق نحو **~40 ثانية** على CPU حديث سريع، و~45 ثانية على Apple Silicon، و~80 ثانية على معالج محمول قديم رباعي الأنوية، و**~130 ثانية** على خادم قديم رباعي الأنوية. إذا كان عبء العمل لديك يميل بكثافة نحو الفيديو، أعطِ الأولوية لأنوية CPU وسرعة الساعة، أو ارفع حد `cpus:` للحاوية، فحزمة compose المرفقة تحدّ التطبيق بـ 4 أنوية افتراضيًا (8 على compose الخاص بـ GPU).

### الموصى به (أدوات الذكاء الاصطناعي على CPU) {#recommended-ai-tools-on-cpu}

| المورد | المتطلب |
|---|---|
| CPU | 4 أنوية |
| RAM | 4 GB |
| القرص | 3 GB (الصورة) + 24 GB (نماذج الذكاء الاصطناعي) + مساحة العمل |
| GPU | غير مطلوب (احتياطي على CPU) |

**تثبيت حزم الذكاء الاصطناعي هو ما يرفع RAM إلى 4 GB.** من دون تثبيت أي ذكاء اصطناعي يعمل التطبيق في وضع الخمول حول 360 MB؛ ومع تثبيت جميع الحزم السبع يحتجز نحو 2.6 GB مقيمة، لأن الوحدة الجانبية للذكاء الاصطناعي بلغة Python تحمّل نماذجها مسبقًا (إزالة الخلفية، والتكبير، وOCR، والنسخ النصي، واكتشاف الوجوه، والترميم) عند بدء التشغيل. تبقى تثبيتات ما هو غير معتمِد على الذكاء الاصطناعي خفيفة؛ أما تثبيتات الذكاء الاصطناعي فتحتاج إلى ‏≥4 GB.

معظم أدوات الذكاء الاصطناعي قابلة للاستخدام تمامًا على CPU؛ لكن أداتين أو ثلاثًا تفضّل GPU فعلًا. مقاسة على CPU حديث رباعي الأنوية:

| أداة الذكاء الاصطناعي | زمن CPU | قابلة للاستخدام على CPU؟ |
|---|---|---|
| اكتشاف الوجوه (تمويه الوجوه، القص الذكي، إزالة العين الحمراء)، إزالة الضوضاء | أقل من ثانية | نعم |
| OCR، والنسخ النصي، والترجمات النصية | 1-3 ثوانٍ | نعم |
| التلوين، وتحسين الوجوه | ~10 ثوانٍ | نعم |
| إزالة/استبدال/تمويه الخلفية | ~29 ثانية | نعم (ستنتظر) |
| التكبير بالذكاء الاصطناعي (RealESRGAN) | ~33 ثانية للصغيرة؛ دقائق على الصور الكبيرة | هامشي، يوصى بشدة بـ GPU |
| ترميم الصور (خط المعالجة الكامل) | عدة دقائق | لا، يحتاج إلى GPU أو CPU سريع متعدد الأنوية |

أحجام تنزيل نماذج الذكاء الاصطناعي:

| الحزمة | حجم القرص |
|---|---|
| إزالة الخلفية | 4-5 GB |
| التكبير + تحسين الوجوه + إزالة الضوضاء | 5-6 GB |
| اكتشاف الوجوه | 200-300 MB |
| ممحاة الكائنات + التلوين | 1-2 GB |
| OCR | 5-6 GB |
| ترميم الصور | 4-5 GB |
| **جميع الحزم** | **~24 GB** |

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
| CPU | 6-8 أنوية (تحضير الفيديو + التزامن يعملان على CPU حتى مع الذكاء الاصطناعي على GPU) |
| RAM | 8 GB |
| GPU | NVIDIA بذاكرة VRAM سعة 8+ GB (يوصى بـ 12 GB) |
| القرص | ~35 GB إجمالًا |

تسرّع بطاقة NVIDIA GPU (CUDA) بشكل كبير نماذج الذكاء الاصطناعي الثقيلة. مقاسة على RTX 4070 مقابل CPU حديث:

| أداة الذكاء الاصطناعي | التسريع مع GPU | ملاحظات |
|---|---|---|
| التكبير بالذكاء الاصطناعي (RealESRGAN 2×) | **~47×** | المكسب الأكبر، أقل من ثانية مقابل ~33 ثانية (دقائق على الصور الكبيرة) |
| تحسين الوجوه (CodeFormer) | **~12×** | ~0.9 ثانية مقابل ~11 ثانية |
| النسخ النصي (Whisper) | ~4.5× | |
| إزالة/استبدال/تمويه الخلفية | ~4× | ~7 ثوانٍ على GPU مقابل ~29 ثانية على CPU |
| التلوين | ~1.8× | |
| OCR، واكتشاف الوجوه، والعين الحمراء، وإزالة الضوضاء | ~1× | سريعة أصلًا على CPU، فلا تفيد GPU |
| ترميم الصور | لا شيء | يعتمد على CPU حتى مع GPU (0% استخدام لـ GPU)؛ CPU سريع أهم من GPU هنا |

الأدوات الجديرة بـ GPU هي **التكبير، وتحسين الوجوه، والنسخ النصي، وإزالة الخلفية**. أما اكتشاف الوجوه وOCR والعين الحمراء فتعتمد على CPU وهي سريعة أصلًا، لذا لا تضيف GPU شيئًا.

يبلغ ذروة استخدام VRAM 7.5 GB أثناء التكبير مع تحسين الوجوه. تعمل بطاقة NVIDIA GPU سعة 6 GB مع معظم أدوات الذكاء الاصطناعي منفردةً لكنها ستفشل في التكبير. تتعامل ذاكرة VRAM سعة 8-12 GB مع كل شيء.

تسريع iGPU من Intel/AMD عبر VA-API أو Quick Sync أو OpenCL غير مدعوم لاستدلال الذكاء الاصطناعي حاليًا. تعيين `/dev/dri` داخل الحاوية لا يفعّل تسريع GPU للذكاء الاصطناعي؛ سيشغّل SnapOtter أدوات الذكاء الاصطناعي على CPU ما لم تكن NVIDIA CUDA متاحة.

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

طلبات تغيير حجم الصور المتوازية مقابل حاوية التطبيق المحدودة بـ 4 أنوية افتراضيًا:

| الطلبات المتزامنة | متوسط زمن الاستجابة | الأخطاء |
|---|---|---|
| 1 | 0.4 ثانية | 0 |
| 5 | 1.2 ثانية | 0 |
| 10 | 2.1 ثانية | 0 |

يتدهور زمن الاستجابة بشكل دون خطي بلا أخطاء عند تشبّع مجموعة العمّال. رفع حد `cpus:` لحاوية التطبيق (أو استخدام مضيف بمزيد من الأنوية) يرفع السقف. لاحظ أن المهام الثقيلة (تحويل الفيديو الترميزي، والذكاء الاصطناعي على CPU) تحتجز عاملًا طوال مدتها، لذا حدّد حجم CPU وفقًا لعدد المهام الثقيلة المتزامنة المتوقع لديك، وليس مجرد عدد الطلبات.

### تنسيقات الصور المدعومة {#supported-image-formats}

يدعم SnapOtter **أكثر من 55 تنسيق إدخال** و**14 تنسيق إخراج**، بما في ذلك ملفات RAW من أكثر من 20 علامة كاميرا تجارية، والتنسيقات الاحترافية (PSD، وEPS، وOpenEXR، وHDR)، والترميزات الحديثة (JPEG XL، وAVIF، وHEIC، وQOI)، والتنسيقات العلمية/الخاصة بالألعاب (FITS، وDDS).

انظر [قائمة التنسيقات الكاملة](/ar/guide/supported-formats) للاطلاع على تفاصيل كل تنسيق مدعوم، والمُفكِّك المستخدَم، وضوابط الجودة المتاحة.

### القيود المعروفة {#known-limitations}

- **تغيير الحجم المدرك للمحتوى** يتعطّل على الصور الكبيرة (>5 ميغابكسل) بسبب قيد في ثنائي caire. يعمل جيدًا مع الصور الأصغر.
- **فك ترميز HEIF** يستغرق 13-23 ثانية. أما HEIC (نسخة Apple) فأسرع بكثير عند 0.3-0.9 ثانية.
- **OCR اليابانية** يفشل على CPU بسبب خطأ في MKLDNN الخاص بـ PaddlePaddle. يعمل على GPU.
- **التكبير** ينتهي بمهلة على CPU لأي شيء أكبر من الصور الصغيرة. يلزم GPU للاستخدام العملي.
- **تحسين الوجوه بـ CodeFormer** أبطأ بكثير من GFPGAN (53 ثانية مقابل ثانيتين على GPU). يوصى بـ GFPGAN لمعظم حالات الاستخدام.

## وحدات التخزين {#volumes}

| نقطة التركيب / وحدة التخزين | الغرض | مطلوبة؟ |
|---|---|---|
| `/data` (التطبيق) | نماذج الذكاء الاصطناعي، وبيئة Python الافتراضية، وملفات المستخدمين | **نعم**، فقدان للملفات من دونها |
| `/tmp/workspace` (التطبيق) | ملفات المعالجة المؤقتة (تُنظَّف تلقائيًا) | موصى بها |
| `SnapOtter-pgdata` (postgres) | دليل بيانات PostgreSQL (المستخدمون، والإعدادات، وخطوط المعالجة، والمهام) | **نعم**، فقدان للبيانات من دونها |
| `SnapOtter-redisdata` (redis) | ملف Redis المُلحَق فقط (append-only) لقوائم انتظار المهام المتينة | موصى بها |

### نقاط التركيب المرتبطة (bind mounts) مقابل وحدات التخزين المسماة {#bind-mounts-vs-named-volumes}

**وحدات التخزين المسماة** (موصى بها)، يدير Docker الصلاحيات تلقائيًا:
```yaml
volumes:
  - SnapOtter-data:/data
```

**نقاط التركيب المرتبطة**، أنت تدير الصلاحيات. اضبط `PUID`/`PGID` لتطابق مستخدم المضيف لديك:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### صلاحيات التخزين {#storage-permissions}

يكتب SnapOtter إلى موقعين أثناء التشغيل: `/data` (ملفات المستخدمين، والسجلات، ونماذج الذكاء الاصطناعي وبيئة Python الافتراضية) و `/tmp/workspace` (مساحة معالجة مؤقتة). يجب أن يكون كلاهما قابلًا للكتابة من قِبل المستخدم الذي تعمل الحاوية بصلاحياته. إذا لم يكن أحدهما كذلك، **تفشل الحاوية بسرعة عند بدء التشغيل** برسالة تسمّي الدليل، وUID/GID الجاري، وكيفية الإصلاح، بدلًا من الإقلاع بحالة "سليمة" ثم الفشل عند أول عملية رفع بخطأ غامض.

تعتمد كيفية التعامل مع الصلاحيات على كيفية إطلاق الحاوية:

**الافتراضي (يبدأ كـ root، ثم يتنازل إلى `snapotter`)**، تبدأ نقطة الدخول كـ root، وتصلح ملكية وحدات التخزين المُركَّبة، ثم تتنازل إلى المستخدم غير المتميّز `snapotter` عبر `gosu`. تعمل وحدات التخزين المسماة من دون أي إعداد. أما نقاط التركيب المرتبطة، فاضبط `PUID`/`PGID` لمستخدم المضيف لديك (أعلاه) بحيث تكون الملفات التي يكتبها مملوكة لك.

**Kubernetes / OpenShift (غير root عبر `runAsUser`)**، عند إطلاقها مباشرةً كمستخدم غير root، لا يمكن للحاوية أن تغيّر ملكية وحدات التخزين بنفسها، لذا يجب على المنسّق (orchestrator) أن يجعلها قابلة للكتابة. اضبط `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

الأدلة القابلة للكتابة في الصورة مملوكة على مستوى المجموعة لـ GID 0 وقابلة للكتابة على مستوى المجموعة، لذا يمكن لحُجيرة (pod) تعمل بـ **UID عشوائي** إضافةً إلى المجموعة التكميلية root (الوضع الافتراضي في OpenShift) أن تكتب من دون أي `chown`.

**TrueNAS Scale (وغيره من إعدادات "UID الأجنبي")**، يشغّل TrueNAS التطبيقات كمستخدم غير root (غالبًا `568:568`) ويركّب مجموعات بيانات المضيف المملوكة لمستخدم مختلف، لذا لا نقطة الدخول ولا `fsGroup` يجعلانها قابلة للكتابة من تلقاء نفسيهما. اختر أحد الخيارات:

- **شغّل التطبيق كـ root** (موصى به)، اترك مستخدم التطبيق غير مضبوط أو اضبطه على `0`، ودع نقطة الدخول الافتراضية تصلح الصلاحيات وتتنازل إلى `snapotter`.
- **شغّل كـ UID `999`**، اضبط مستخدم/مجموعة التطبيق على `999:999` (مستخدم SnapOtter المدمج `snapotter`) بحيث يطابق ملكية الصورة.
- **`chown` مجموعة بيانات المضيف** إلى UID الذي تعمل به الحاوية، من صدفة (shell) TrueNAS:

  ```bash
  # استخدم UID من خطأ بدء التشغيل (أو شغّل `id` داخل الحاوية)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

يسمّي خطأ بدء التشغيل UID الدقيق الذي يجب استخدامه، لذا فإن أسرع طريق هو بدء التطبيق مرة واحدة، وقراءة الرسالة، ثم `chown` (أو تعديل المستخدم) وفقًا لذلك.

## متغيرات البيئة {#environment-variables}

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `AUTH_ENABLED` | `true` | تمكين/تعطيل اشتراط تسجيل الدخول |
| `DEFAULT_USERNAME` | `admin` | اسم المستخدم المسؤول الأولي |
| `DEFAULT_PASSWORD` | `admin` | كلمة مرور المسؤول الأولية (يُفرَض تغييرها عند أول تسجيل دخول) |
| `MAX_UPLOAD_SIZE_MB` | `100` | حد الرفع لكل ملف |
| `MAX_BATCH_SIZE` | `100` | الحد الأقصى للملفات في كل طلب دفعة |
| `RATE_LIMIT_PER_MIN` | `1000` | طلبات API في الدقيقة لكل عنوان IP (اضبط 0 للتعطيل) |
| `MAX_USERS` | `0` (غير محدود) | الحد الأقصى لحسابات المستخدمين |
| `TRUST_PROXY` | `true` | الوثوق برؤوس X-Forwarded-For من الوكيل العكسي |
| `PUID` | `999` | التشغيل بهذا الـ UID (لصلاحيات نقاط التركيب المرتبطة) |
| `PGID` | `999` | التشغيل بهذا الـ GID (لصلاحيات نقاط التركيب المرتبطة) |
| `LOG_LEVEL` | `info` | مستوى تفصيل السجل: fatal، error، warn، info، debug، trace |
| `CONCURRENT_JOBS` | `0` (تلقائي) | الحد الأقصى لمهام معالجة الذكاء الاصطناعي المتوازية |
| `SESSION_DURATION_HOURS` | `168` | عمر جلسة تسجيل الدخول (7 أيام) |
| `CORS_ORIGIN` | (فارغ) | مصادر (origins) مسموح بها مفصولة بفواصل، أو فارغ للمصدر نفسه |

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

يضبط SnapOtter `TRUST_PROXY=true` افتراضيًا بحيث يستخدم تحديد المعدل والتسجيل عنوان IP الحقيقي للعميل من رؤوس `X-Forwarded-For`.

### Nginx {#nginx}

```nginx
server {
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

        # SSE support (batch progress, feature install progress)
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Nginx Proxy Manager {#nginx-proxy-manager}

1. أضف مضيف وكيل جديدًا (Proxy Host)
2. اضبط اسم النطاق (Domain Name) على نطاقك
3. اضبط المخطط (Scheme) على `http`، واسم مضيف التوجيه (Forward Hostname) على `SnapOtter` (أو عنوان IP لحاويتك)، ومنفذ التوجيه (Forward Port) على `1349`
4. فعّل دعم WebSocket
5. تحت Advanced، أضف: `client_max_body_size 500M;` و `proxy_buffering off;`

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

`flush_interval -1` يعطّل تخزين الاستجابة المؤقت، وهو مطلوب لأحداث تقدم SSE (معالجة الدفعات، وأدوات الذكاء الاصطناعي، وتثبيت الميزات). تتيح المهل الممتدة اكتمال عمليات رفع الملفات الكبيرة من دون أن يغلق Caddy الاتصال مبكرًا.

### أنفاق Cloudflare (Cloudflare Tunnels) {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

ملاحظة: لدى Cloudflare حد رفع قدره 100 MB على الخطط المجانية. اضبط `MAX_UPLOAD_SIZE_MB=100` لمطابقته.

## CI/CD {#ci-cd}

يحتوي مستودع GitHub على ثلاثة مسارات عمل (workflows):

- **ci.yml** - يعمل تلقائيًا عند كل دفع وطلب سحب. يدقّق لغويًا، ويتحقق من الأنواع، ويختبر، ويبني، ويصادق على صورة Docker (من دون دفع).
- **release.yml** - يُشغَّل يدويًا عبر `workflow_dispatch`. يشغّل semantic-release لإنشاء وسم إصدار (version tag) وإصدار GitHub، ثم يبني صورة Docker متعددة المعماريات (amd64 + arm64) ويدفعها إلى Docker Hub (`snapotter/snapotter`) وGitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - يبني موقع التوثيق هذا وينشره إلى Cloudflare Pages عند الدفع إلى `main`.

لإنشاء إصدار، اذهب إلى **Actions > Release > Run workflow** في واجهة GitHub، أو شغّل:

```bash
gh workflow run release.yml
```

يحدّد semantic-release الإصدار من تاريخ الالتزامات. يشير وسم Docker `latest` دائمًا إلى أحدث إصدار.

## التحليلات {#analytics}

يتضمن SnapOtter تحليلات منتج مجهولة الهوية (أنماط استخدام الأدوات، وتقارير الأخطاء) للمساعدة في اكتشاف الأخطاء وتحسين الميزات. وهي مفعّلة افتراضيًا. ملفاتك، وأسماء ملفاتك، وبياناتك الشخصية ليست جزءًا من هذا أبدًا. يعمل SnapOtter بشكل طبيعي مع تعطيل التحليلات.

### تعطيل التحليلات {#disabling-analytics}

الانسحاب أثناء التشغيل هو مفتاح تبديل للمسؤول بنقرة واحدة. افتح Settings > System > Privacy وأوقف تشغيل Anonymous Product Analytics. يتوقف فورًا للنسخة بأكملها، من دون الحاجة إلى إعادة بناء.

للحصول على صورة لا يمكنها أبدًا أن تبعث تحليلات، اضبط الإيقاف الصارم في وقت البناء عبر نسخ المستودع وإعادة بنائه:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

أو أضف وسيط البناء إلى `docker-compose.yml` الموجود لديك:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
