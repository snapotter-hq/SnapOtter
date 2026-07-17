---
description: "انشر SnapOtter في بيئة الإنتاج باستخدام Docker. متطلبات العتاد وإعداد GPU وإعدادات الوكيل العكسي لـ Nginx و Traefik و Cloudflare."
i18n_output_hash: 44503f8d944c
i18n_source_hash: 98172965118b
i18n_provenance: human
---

# النشر {#deployment}

يُنشَر SnapOtter كحزمة Docker Compose مكوّنة من 3 حاويات: صورة تطبيق SnapOtter، و PostgreSQL 17، و Redis 8. تدعم صورة التطبيق **linux/amd64** (مع NVIDIA CUDA لتسريع الذكاء الاصطناعي) و **linux/arm64** (المعالج المركزي)، لذا فهي تعمل بشكل أصيل على خوادم Intel/AMD، وأجهزة Mac العاملة بـ Apple Silicon، وأجهزة ARM مثل Raspberry Pi 4/5. تسريع iGPU من Intel/AMD عبر VA-API أو Quick Sync أو OpenCL غير مدعوم لاستدلال الذكاء الاصطناعي حاليًا.

راجع [صورة Docker](./docker-tags) لإعداد GPU وأمثلة Docker Compose وتثبيت الإصدار.


<!-- korean-ocr-contract:start -->
::: info توافق OCR الكوري
يدعم Fast OCR اللغات `auto` و`en` و`de` و`es` و`fr` و`zh` و`ja`، لكنه لا يدعم الكورية (`ko`). تتطلب الكورية حزمة OCR الدقيقة ومستوى `balanced` أو `best`. تعمل الحزمة على حاويات Linux amd64 وarm64 الرسمية، بما في ذلك مضيفات NVIDIA حيث يبقى OCR على CPU. تُرجع الأنظمة غير المدعومة خطأ توافق صريحاً ولا تعود بصمت إلى `fast`. كما يُرفض طلب Korean مع `fast` أو الاسم القديم `tesseract` قبل وضعه في قائمة الانتظار، مع `FEATURE_INCOMPATIBLE` والسبب `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## بداية سريعة (المعالج المركزي) {#quick-start-cpu}

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

يصبح التطبيق حينها متاحًا على `http://localhost:1349`.

> **حدود معدل Docker Hub؟** استبدل `snapotter/snapotter:latest` بـ `ghcr.io/snapotter-hq/snapotter:latest` للسحب من GitHub Container Registry بدلاً من ذلك. يتلقى كلا السجلين نفس الصورة عند كل إصدار.

## بداية سريعة (NVIDIA CUDA) {#quick-start-nvidia-cuda}

لتسريع NVIDIA CUDA على أدوات الذكاء الاصطناعي المدعومة (إزالة الخلفية، ورفع المستوى، وتحسين الوجه):

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

تأتي هذه الأرقام من اختبارات أداء عبر مجموعة من الأنظمة، من محطة عمل amd64 حديثة مزوّدة ببطاقة NVIDIA RTX 4070 وصولًا إلى Raspberry Pi، حيث شُغِّل كامل كتالوج الأدوات على كل منها مع مسح حدود موارد Docker لإيجاد الحد الأدنى الفعلي.

هل تعمل عند الطرف الأدنى من هذه المستويات (جهاز Pi، أو حاسوب محمول قديم، أو VPS بذاكرة 2 جيجابايت)؟ يحوّل [التشغيل على موارد محدودة](/ar/guide/low-resource) هذه الأرقام إلى شرح تطبيقي ملموس بسقوف مضبوطة.

### مرجع سريع {#quick-reference}

| المستوى | حالة الاستخدام | المعالج المركزي | الذاكرة | GPU | التخزين |
|------|----------|-----|-----|-----|---------|
| الحد الأدنى | أدوات الصور والملفات و PDF الخفيفة؛ مستخدم واحد؛ دفعات صغيرة | نواتان | 2 جيجابايت | لا شيء | ~7 جيجابايت |
| الموصى به | جميع الوسائط الخمس بما في ذلك الفيديو و PDF والذكاء الاصطناعي على المعالج المركزي؛ دفعات؛ عدد قليل من المستخدمين | 4 أنوية | 4 جيجابايت | لا شيء | ~25 جيجابايت |
| الكامل | كل شيء بسرعة بما في ذلك ذكاء اصطناعي GPU؛ دفعات كبيرة؛ عدد كبير من المستخدمين | 6-8 أنوية | NVIDIA بذاكرة VRAM 8 جيجابايت+ (12 جيجابايت مريحة) | ~35 جيجابايت |

**المعمارية: 64 بت فقط** (`linux/amd64` أو `linux/arm64`). يعمل SnapOtter بشكل أصيل على خوادم Intel/AMD، وأجهزة Mac العاملة بـ Apple Silicon، ولوحات ARM بمعمارية 64 بت بما في ذلك **Raspberry Pi 4 و 5** (4-8 جيجابايت). لا يعمل على ARM بمعمارية 32 بت (`armv7`/`armhf`) — إذ لا تُبنى له أي صورة — ولا على اللوحات من فئة 512 ميجابايت مثل Pi Zero، التي تقع دون الحد الأدنى للذاكرة (انظر أدناه).

### الحد الأدنى (أدوات الصور والملفات و PDF الخفيفة؛ بدون ذكاء اصطناعي) {#minimum-image-files-and-light-pdf-tools-no-ai}

| المورد | المتطلب |
|---|---|
| المعالج المركزي | نواتان |
| الذاكرة | 2 جيجابايت |
| القرص | ~5.5 جيجابايت (الصورة) + وحدة تخزين البيانات |
| GPU | غير مطلوب |

جميع أدوات الكتالوج غير المعتمدة على الذكاء الاصطناعي البالغ عددها 222 - الصور (تغيير الحجم، والاقتصاص، والتحويل، والضغط، والتعديل، والعلامة المائية)، والفيديو (القص، والكتم، وإعادة الحاوية)، والصوت (التحويل، والتسوية، والقص)، و PDF (الدمج، والتقسيم، والضغط، والتدوير، والحماية)، وتحويلات الملفات، وإعدادات التحويل المسبقة المخصصة - تعمل على عتاد متواضع. تنتهي معظم العمليات في أقل من ثانية بكثير حتى على ملف كبير: تتغير أبعاد صورة بحجم 2.7 ميجابايت في ~0.05 ثانية ويُعاد ترميزها إلى WebP في ~2 ثانية.

الحد الأدنى للذاكرة حقيقي، وفقًا لمسح حدود موارد Docker: **512 ميجابايت لا يمكنها بدء الحزمة** (حتى تغيير حجم صورة واحدة يُقتَل)، و **1 جيجابايت** تتعامل مع عمليات الملف الواحد لكن دفعة متعددة الملفات تستنفد الذاكرة، و **2 جيجابايت / نواتان** هي أصغر تهيئة تتعامل مع الدفعات بشكل مريح.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**الاستثناء الوحيد كثيف الاستهلاك للمعالج المركزي هو إعادة ترميز الفيديو.** عمليات نسخ التدفق (القص، والكتم، وإعادة حاوية الحاوية) فورية، لكن التحويل إلى ترميز مختلف يعتمد على المعالج المركزي. مقطع بدقة 1080p ومدة 45 ثانية أُعيد ترميزه إلى VP9 (WebM) يستغرق نحو **~40 ثانية** على معالج مركزي حديث سريع، و ~45 ثانية على Apple Silicon، و ~80 ثانية على معالج جوّال قديم رباعي الأنوية، و **~130 ثانية** على خادم قديم رباعي الأنوية. إذا كان عبء العمل لديك يعتمد بكثافة على الفيديو، فأعطِ الأولوية لأنوية المعالج المركزي وسرعة التردد، أو ارفع حد `cpus:` للحاوية — يحدّ ملف compose المُرفَق التطبيق بـ 4 أنوية افتراضيًا (8 على compose الخاص بـ GPU).

### الموصى به (أدوات الذكاء الاصطناعي على المعالج المركزي) {#recommended-ai-tools-on-cpu}

| المورد | المتطلب |
|---|---|
| المعالج المركزي | 4 أنوية |
| الذاكرة | 4 جيجابايت |
| Disk | 3 جيجابايت (صورة) + حوالي 20 جيجابايت (جميع حزم الذكاء الاصطناعي الاختيارية) + مساحة عمل |
| GPU | غير مطلوب (رجوع إلى المعالج المركزي) |

**تثبيت وتشغيل حزم الذكاء الاصطناعي الأكبر حجمًا هو ما يدفع التوصية إلى 4 جيجابايت من RAM.** مع عدم وجود حزم اختيارية مثبتة، يظل التطبيق في وضع الخمول بحوالي 360 ميجابايت. تشترك أدوات Python القديمة في sidecar، في حين تستخدم OCR الدقيقة dispatcher مخصصة طويلة الأمد مثبتة على الجيل النشط غير القابل للتغيير. قبل التنشيط، يقوم المثبت بتشغيل smoke test على المرشح. ثم يتحول ذريًا إلى dispatcher الجديد ويستنزف dispatcher السابق قبل garbage collection. يجب على كل قطعة أثرية رسمية للتعرف الضوئي على الحروف (OCR) أن تجتاز أسوأ حالة release suite داخل 4 GiB cgroup، بينما تترك توصية المضيف بسعة 4 جيجابايت مجالًا لتطبيق Node.js و Postgres و Redis وقوائم الانتظار والعمل المتزامن.

معظم أدوات الذكاء الاصطناعي قابلة للاستخدام تمامًا على المعالج المركزي؛ واثنتان منها تحتاجان GPU فعلًا. قِيست على معالج مركزي رباعي الأنوية حديث:

| أداة الذكاء الاصطناعي | زمن المعالج المركزي | قابلة للاستخدام على المعالج المركزي؟ |
|---|---|---|
| اكتشاف الوجوه (تمويه الوجوه، الاقتصاص الذكي، العين الحمراء)، إزالة الضوضاء | أقل من ثانية | نعم |
| OCR، والنسخ النصي، والترجمات | 1-3 ثوانٍ | نعم |
| التلوين، وتحسين الوجوه | ~10 ثوانٍ | نعم |
| إزالة/استبدال/تمويه الخلفية | ~29 ثانية | نعم (ستنتظر) |
| تكبير دقة الذكاء الاصطناعي (RealESRGAN) | ~33 ثانية للصغيرة؛ دقائق على الصور الكبيرة | هامشي — يُوصى بشدة باستخدام GPU |
| استعادة الصور (خط الأنابيب الكامل) | عدة دقائق | لا — يحتاج GPU أو معالجًا مركزيًا سريعًا متعدد الأنوية |

لا يدمج SnapOtter عمدًا تنزيلات هذه النماذج داخل صورة Docker. تُسحب حزم الذكاء الاصطناعي فقط عندما يُفعّل المسؤول الأداة ذات الصلة، وتُخزَّن في وحدة التخزين الدائمة `/data/ai`، وتُشارَك بين كل أداة تعتمد على نفس مجموعة النماذج. هذا يبقي صورة الحاوية النهائية صغيرة مع السماح لتثبيت ذكاء اصطناعي كامل ببلوغ أرقام التخزين الأكبر أدناه.

تعتمد بعض الأدوات على أكثر من حزمة مشتركة. على سبيل المثال، تحتاج صورة جواز السفر إلى كل من `background-removal` و `face-detection`؛ إذا كانت `background-removal` مثبّتة بالفعل، فإن تفعيل صورة جواز السفر لا ينزّل سوى الحزمة المفقودة `face-detection`. تنطبق نفس إعادة الاستخدام عبر جميع أدوات الذكاء الاصطناعي.

تقديرات تخزين حزمة AI الاختيارية:

| الحزمة | حجم القرص |
|---|---|
| إزالة الخلفية | 4-5 جيجابايت |
| تكبير الدقة + تحسين الوجوه + إزالة الضوضاء | 5-6 جيجابايت |
| اكتشاف الوجوه | 200-300 ميجابايت |
| ممحاة الكائنات + التلوين | 1-2 جيجابايت |
| دقيق OCR (`balanced`/`best`) | ~208-234 MiB تنزيل / ~409-488 MiB مثبتة |
| استعادة الصور | 4-5 جيجابايت |
| النسخ | ~600 ميجابايت |
| **جميع الباقات** | **~20 جيجابايت مثبتة** |

تم دمج Fast OCR في الصورة من خلال Tesseract، ويضيف حوالي 25 MiB، ولا يتطلب حزمة OCR الاختيارية أو متطلبات الذاكرة 4 GiB الخاصة بها. تتوفر الحزمة الدقيقة في حاويات Linux amd64 و arm64 الرسمية وتقوم بتشغيل ONNX Runtime على CPU. يستخدم مضيفو NVIDIA نفس وقت تشغيل CPU OCR، لذلك لا يعتمد OCR على إصدار CUDA أو بنية GPU. يتطلب وقت التشغيل الدقيق ما لا يقل عن 4 GiB من الذاكرة الفعالة: الحد الأقصى للحاوية التي تم تكوينها cgroup، خلاف ذلك الذاكرة المضيفة. يرفض SnapOtter الأنظمة التي تقل عن الحد الأدنى من التوافق الموقع قبل تنزيل الحزمة. يتم أيضًا رفض التثبيت الدقيق للحزمة على أرشيفات bare-metal/المنشأة مسبقًا والتي لا يمكن ضمان libc و Python ABI لها.

يجب أن تستخدم النسخ المتماثلة التي تشترك في `DATA_DIR` نفسه بنية CPU نفسها؛ ثبّت عمليات النشر متعددة النسخ على عُقد متوافقة باستخدام تقارب العُقد (node affinity). تحتاج النسخ المختلطة من amd64 وarm64 إلى وحدات تخزين بيانات منفصلة وعمليات نشر مستقلة لـ SnapOtter.

يحافظ وقت التشغيل الدقيق على جيل واحد نشط ويقوم بمسح ذاكرة التخزين المؤقت للتنزيل بعد التنشيط. لهذا الإصدار، يحتاج التثبيت الأول مؤقتًا إلى ما يقرب من 620-720 MiB للأرشيف بالإضافة إلى التدريج، ويمكن أن تصل الترقية إلى ذروتها بالقرب من 1.2 GiB بينما يظل الجيل القديم نشطًا. يحسب المثبت المتطلبات الدقيقة من الفهرس الموقع والأجيال الحالية قبل التنزيل أو الاستخراج، ويفشل مبكرًا إذا كان حجم البيانات صغيرًا جدًا.

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
| المعالج المركزي | 6-8 أنوية (تحضير الفيديو + التزامن يعملان على المعالج المركزي حتى مع ذكاء اصطناعي GPU) |
| الذاكرة | 8 جيجابايت |
| GPU | NVIDIA بذاكرة VRAM 8+ جيجابايت (يُوصى بـ 12 جيجابايت) |
| القرص | ~35 جيجابايت إجمالًا |

تسرّع بطاقة NVIDIA GPU (CUDA) نماذج الذكاء الاصطناعي الثقيلة بشكل كبير. قِيست على RTX 4070 مقابل معالج مركزي حديث:

| أداة الذكاء الاصطناعي | التسريع مع GPU | ملاحظات |
|---|---|---|
| تكبير دقة الذكاء الاصطناعي (RealESRGAN 2×) | **~47×** | أكبر مكسب — أقل من ثانية مقابل ~33 ثانية (دقائق على الصور الكبيرة) |
| تحسين الوجوه (CodeFormer) | **~12×** | ~0.9 ثانية مقابل ~11 ثانية |
| النسخ النصي (Whisper) | ~4.5× | |
| إزالة/استبدال/تمويه الخلفية | ~4× | ~7 ثوانٍ على GPU مقابل ~29 ثانية على المعالج المركزي |
| التلوين | ~1.8× | |
| OCR، واكتشاف الوجوه، والعين الحمراء، وإزالة الضوضاء | ~1× | سريعة بالفعل على المعالج المركزي — لا يساعد GPU |
| استعادة الصور | لا شيء | تعتمد على المعالج المركزي حتى على GPU (استخدام GPU 0%)؛ المعالج المركزي السريع أهم من GPU هنا |

الأدوات التي تستحق GPU هي **تكبير الدقة، وتحسين الوجوه، والنسخ النصي، وإزالة الخلفية**. اكتشاف الوجوه و OCR والعين الحمراء تعتمد على المعالج المركزي وسريعة بالفعل، لذا لا يضيف GPU شيئًا.

يبلغ الاستخدام الأقصى لذاكرة VRAM 7.5 جيجابايت أثناء تكبير الدقة مع تحسين الوجوه. تعمل بطاقة NVIDIA GPU بذاكرة 6 جيجابايت مع معظم أدوات الذكاء الاصطناعي بشكل فردي لكنها ستفشل في تكبير الدقة. تتعامل ذاكرة VRAM 8-12 جيجابايت مع كل شيء.

تسريع iGPU من Intel/AMD عبر VA-API أو Quick Sync أو OpenCL غير مدعوم لاستدلال الذكاء الاصطناعي حاليًا. تعيين `/dev/dri` داخل الحاوية لا يُفعّل تسريع GPU للذكاء الاصطناعي؛ سيشغّل SnapOtter أدوات الذكاء الاصطناعي على المعالج المركزي ما لم يكن NVIDIA CUDA متاحًا.

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

طلبات تغيير حجم الصور المتوازية مقابل حاوية التطبيق المحدودة افتراضيًا بأربعة أنوية:

| الطلبات المتزامنة | متوسط زمن الاستجابة | الأخطاء |
|---|---|---|
| 1 | 0.4 ثانية | 0 |
| 5 | 1.2 ثانية | 0 |
| 10 | 2.1 ثانية | 0 |

يتدهور زمن الاستجابة بشكل دون خطي مع عدم وجود أخطاء عند تشبّع مجمّع العمال. رفع حد `cpus:` لحاوية التطبيق (أو استخدام مضيف بمزيد من الأنوية) يرفع السقف. لاحظ أن المهام الثقيلة (تحويل ترميز الفيديو، وذكاء المعالج المركزي الاصطناعي) تحتجز عاملًا طوال مدتها الكاملة، لذا حجّم المعالج المركزي وفقًا لعدد المهام الثقيلة المتزامنة المتوقعة لديك، لا وفقًا لعدد الطلبات فقط.

### تنسيقات الصور المدعومة {#supported-image-formats}

يدعم SnapOtter **55+ تنسيق إدخال** و **14 تنسيق إخراج**، بما في ذلك ملفات RAW من أكثر من 20 علامة كاميرا تجارية، والتنسيقات الاحترافية (PSD، و EPS، و OpenEXR، و HDR)، والترميزات الحديثة (JPEG XL، و AVIF، و HEIC، و QOI)، والتنسيقات العلمية/الألعاب (FITS، و DDS).

راجع [قائمة التنسيقات الكاملة](/ar/guide/supported-formats) للاطلاع على تفاصيل كل تنسيق مدعوم، والمُفكِّك المستخدم، وضوابط الجودة المتاحة.

### القيود المعروفة {#known-limitations}

- **تغيير الحجم المدرك للمحتوى** يتعطل على الصور الكبيرة (>5 ميجابكسل) بسبب قيد في ثنائي caire. يعمل بشكل جيد مع الصور الأصغر.
- **فك ترميز HEIF** يستغرق 13-23 ثانية. HEIC (نسخة Apple) أسرع بكثير عند 0.3-0.9 ثانية.
- **تكبير الدقة** ينتهي وقته على المعالج المركزي لأي شيء يتجاوز الصور الصغيرة. GPU مطلوب للاستخدام العملي.
- **تحسين الوجوه بـ CodeFormer** أبطأ بشكل ملحوظ من GFPGAN (53 ثانية مقابل 2 ثانية على GPU). يُوصى بـ GFPGAN لمعظم حالات الاستخدام.

## وحدات التخزين {#volumes}

| نقطة التركيب / وحدة التخزين | الغرض | مطلوبة؟ |
|---|---|---|
| `/data` (التطبيق) | نماذج الذكاء الاصطناعي، وبيئة Python الافتراضية، وملفات المستخدمين | **نعم** - فقدان للملفات بدونها |
| `/tmp/workspace` (التطبيق) | ملفات المعالجة المؤقتة (تُنظَّف تلقائيًا) | موصى بها |
| `SnapOtter-pgdata` (postgres) | دليل بيانات PostgreSQL (المستخدمون، والإعدادات، وخطوط الأنابيب، والمهام) | **نعم** - فقدان للبيانات بدونها |
| `SnapOtter-redisdata` (redis) | ملف Redis للإلحاق فقط لطوابير المهام الدائمة | موصى بها |

### التركيبات الرابطة مقابل وحدات التخزين المسمّاة {#bind-mounts-vs-named-volumes}

**وحدات التخزين المسمّاة** (موصى بها) — يدير Docker الأذونات تلقائيًا:
```yaml
volumes:
  - SnapOtter-data:/data
```

**التركيبات الرابطة** — أنت تدير الأذونات. عيّن `PUID`/`PGID` لمطابقة مستخدم المضيف لديك:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### أذونات التخزين {#storage-permissions}

يكتب SnapOtter إلى موقعين في وقت التشغيل: `/data` (ملفات المستخدمين، والسجلات، ونماذج الذكاء الاصطناعي وبيئة Python الافتراضية) و `/tmp/workspace` (مساحة عمل المعالجة المؤقتة). يجب أن يكون كلاهما قابلًا للكتابة من قِبل المستخدم الذي تعمل الحاوية بصلاحياته. إذا لم يكن أحدهما كذلك، تفشل الحاوية **بسرعة عند بدء التشغيل** مع رسالة تُسمّي الدليل، و UID/GID العامل، وكيفية الإصلاح — بدلًا من الإقلاع بحالة "سليمة" ثم الفشل عند أول عملية رفع بخطأ غامض.

تعتمد كيفية التعامل مع الأذونات على كيفية إطلاق الحاوية:

**الافتراضي (يبدأ كـ root، وينزل إلى `snapotter`)** — تبدأ نقطة الدخول كـ root، وتصلح ملكية وحدات التخزين المركّبة، ثم تنزل إلى مستخدم `snapotter` غير المميّز عبر `gosu`. تعمل وحدات التخزين المسمّاة دون أي تهيئة. للتركيبات الرابطة، عيّن `PUID`/`PGID` إلى مستخدم المضيف لديك (أعلاه) حتى تكون الملفات التي تكتبها مملوكة لك.

**Kubernetes / OpenShift (غير root عبر `runAsUser`)** — عند إطلاقها مباشرة كمستخدم غير root، لا تستطيع الحاوية تغيير ملكية وحدات التخزين بنفسها، لذا يجب على المنسّق جعلها قابلة للكتابة. عيّن `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

أدلة الصورة القابلة للكتابة مملوكة على مستوى المجموعة لـ GID 0 وقابلة للكتابة من قِبل المجموعة، لذا يمكن لحاوية pod تعمل بـ **UID عشوائي** بالإضافة إلى مجموعة root التكميلية (الافتراضي في OpenShift) الكتابة دون أي `chown`.

**TrueNAS Scale (وإعدادات "UID الأجنبي" الأخرى)** — يشغّل TrueNAS التطبيقات كمستخدم غير root (غالبًا `568:568`) ويركّب مجموعات بيانات المضيف المملوكة لمستخدم مختلف، لذا لا نقطة الدخول ولا `fsGroup` يجعلها قابلة للكتابة بمفردها. اختر واحدًا:

- **تشغيل التطبيق كـ root** (موصى به) — اترك مستخدم التطبيق غير مضبوط أو عيّنه إلى `0`، ودع نقطة الدخول الافتراضية تصلح الأذونات وتنزل إلى `snapotter`.
- **التشغيل كـ UID `999`** — عيّن مستخدم/مجموعة التطبيق إلى `999:999` (مستخدم `snapotter` المدمج في SnapOtter) حتى يطابق ملكية الصورة.
- **`chown` مجموعة بيانات المضيف** إلى UID الذي تعمل به الحاوية، من صدفة TrueNAS:

  ```bash
  # استخدم UID من خطأ بدء التشغيل (أو شغّل `id` داخل الحاوية)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

يسمّي خطأ بدء التشغيل UID الدقيق المطلوب استخدامه، لذا فإن أسرع مسار هو بدء التطبيق مرة واحدة، وقراءة الرسالة، ثم `chown` (أو تعديل المستخدم) وفقًا لذلك.

## متغيرات البيئة {#environment-variables}

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `AUTH_ENABLED` | `true` | تفعيل/تعطيل متطلب تسجيل الدخول |
| `DEFAULT_USERNAME` | `admin` | اسم المستخدم المسؤول الأولي |
| `DEFAULT_PASSWORD` | `admin` | كلمة مرور المسؤول الأولية (يُفرض تغييرها عند أول تسجيل دخول) |
| `MAX_UPLOAD_SIZE_MB` | `100` | حد الرفع لكل ملف |
| `MAX_BATCH_SIZE` | `100` | الحد الأقصى للملفات لكل طلب دفعة |
| `RATE_LIMIT_PER_MIN` | `1000` | طلبات API في الدقيقة لكل عنوان IP (عيّن 0 للتعطيل) |
| `MAX_USERS` | `0` (غير محدود) | الحد الأقصى لحسابات المستخدمين |
| `TRUST_PROXY` | `true` | الوثوق برؤوس X-Forwarded-For من الوكيل العكسي |
| `PUID` | `999` | التشغيل بهذا UID (لأذونات التركيب الرابط) |
| `PGID` | `999` | التشغيل بهذا GID (لأذونات التركيب الرابط) |
| `LOG_LEVEL` | `info` | إسهاب السجل: fatal، و error، و warn، و info، و debug، و trace |
| `CONCURRENT_JOBS` | `0` (تلقائي) | الحد الأقصى لمهام معالجة الذكاء الاصطناعي المتوازية |
| `SESSION_DURATION_HOURS` | `168` | عمر جلسة تسجيل الدخول (7 أيام) |
| `CORS_ORIGIN` | (فارغ) | المصادر المسموح بها مفصولة بفواصل، أو فارغ للمصدر نفسه |

### الوكيل الصادر وCA الخاص {#outbound-proxy-and-private-ca}

تتيح الحاوية الرسمية دعم وكيل البيئة الخاص بالعقدة. لو SnapOtter يجب أن تصل إلى OCR مستودع وقت التشغيل أو خدمات HTTPS الأخرى من خلال وكيل الشركة، اضبط `HTTPS_PROXY` (و `HTTP_PROXY` عند الحاجة). قم بتعيين `NO_PROXY` على قائمة مفصولة بفواصل للمضيفين الذين يجب الوصول إليهم مباشرة، مثل Postgres, Redis, وتخزين الكائنات الداخلية.

إذا تم توقيع الوكيل أو الخدمة الداخلية بواسطة مرجع مصدق خاص، فقم بتحميل شهادة CA للقراءة فقط وأشر `NODE_EXTRA_CA_CERTS` إليها. يجب أن يكون الملف موجودًا عند بدء عملية العقدة:

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

احتفظ ببيانات اعتماد الوكيل خارج ملف Compose (على سبيل المثال، في ملف `.env` محمي أو سر). لا تقم بتعطيل التحقق من TLS: يقوم فهرس OCR الموقع بالمصادقة على بيانات تعريف الإصدار، بينما لا يزال التحقق من صحة TLS العادي يحمي النقل وكل طلب صادر آخر.

## فحص الصحة {#health-check}

تتضمن الحاوية فحص صحة مدمجًا:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## الوكيل العكسي {#reverse-proxy}

يعيّن SnapOtter `TRUST_PROXY=true` افتراضيًا حتى يستخدم تحديد المعدل والتسجيل عنوان IP الحقيقي للعميل من رؤوس `X-Forwarded-For`.

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

1. أضف مضيف وكيل جديد
2. عيّن اسم النطاق إلى نطاقك
3. عيّن المخطط إلى `http`، واسم مضيف التوجيه إلى `SnapOtter` (أو عنوان IP الخاص بحاويتك)، ومنفذ التوجيه إلى `1349`
4. فعّل دعم WebSocket
5. ضمن الإعدادات المتقدمة، أضف: `client_max_body_size 500M;` و `proxy_buffering off;`

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

يعطّل `flush_interval -1` التخزين المؤقت للاستجابة، وهو مطلوب لأحداث تقدم SSE (المعالجة على دفعات، وأدوات الذكاء الاصطناعي، وتثبيت الميزات). تسمح مهل الانتظار الممتدة لعمليات رفع الملفات الكبيرة بالاكتمال دون أن يغلق Caddy الاتصال مبكرًا.

### أنفاق Cloudflare {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

ملاحظة: لدى Cloudflare حد رفع قدره 100 ميجابايت على الخطط المجانية. عيّن `MAX_UPLOAD_SIZE_MB=100` ليطابق ذلك.

## CI/CD {#ci-cd}

يحتوي مستودع GitHub على ثلاثة سير عمل:

- **ci.yml** - يعمل تلقائيًا عند كل دفع و PR. يفحص الصياغة، والأنواع، ويختبر، ويبني، ويتحقق من صورة Docker (دون دفعها).
- **release.yml** - يُشغَّل يدويًا عبر `workflow_dispatch`. يشغّل semantic-release لإنشاء وسم إصدار وإصدار GitHub، ثم يبني صورة Docker متعددة المعماريات (amd64 + arm64) ويدفعها إلى Docker Hub (`snapotter/snapotter`) و GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - يبني موقع الوثائق هذا وينشره على Cloudflare Pages عند الدفع إلى `main`.

لإنشاء إصدار، انتقل إلى **Actions > Release > Run workflow** في واجهة GitHub، أو شغّل:

```bash
gh workflow run release.yml
```

يحدّد semantic-release الإصدار من سجل الالتزامات. يشير وسم Docker `latest` دائمًا إلى أحدث إصدار.

## التحليلات {#analytics}

يتضمن SnapOtter تحليلات منتج مجهولة (أنماط استخدام الأدوات، وتقارير الأخطاء) للمساعدة في اكتشاف العلل وتحسين الميزات. وهي مفعّلة افتراضيًا. لا تكون ملفاتك ولا أسماء ملفاتك ولا بياناتك الشخصية جزءًا من هذا أبدًا. يعمل SnapOtter بشكل طبيعي مع تعطيل التحليلات.

### تعطيل التحليلات {#disabling-analytics}

إلغاء الاشتراك في وقت التشغيل هو مفتاح تبديل للمسؤول بنقرة واحدة. افتح Settings > System > Privacy وأطفئ Anonymous Product Analytics. يتوقف فورًا للنسخة بأكملها، دون الحاجة لإعادة بناء.

للحصول على صورة لا يمكنها أبدًا إصدار تحليلات، عيّن الإيقاف الصلب في وقت البناء عبر استنساخ المستودع وإعادة البناء:

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
