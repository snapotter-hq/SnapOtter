---
description: "SnapOtter को Docker के साथ प्रोडक्शन में डिप्लॉय करें। हार्डवेयर आवश्यकताएँ, GPU सेटअप, और Nginx, Traefik तथा Cloudflare के लिए रिवर्स प्रॉक्सी कॉन्फ़िग।"
i18n_source_hash: 3821f105f4ba
i18n_provenance: machine
i18n_output_hash: 306ca03c89bd
i18n_hash_version: 2
---

# डिप्लॉयमेंट {#deployment}

SnapOtter 3-कंटेनर Docker Compose स्टैक के रूप में डिप्लॉय होता है: SnapOtter ऐप इमेज, PostgreSQL 17, और Redis 8। ऐप इमेज **linux/amd64** (AI त्वरण के लिए NVIDIA CUDA के साथ) और **linux/arm64** (CPU) को सपोर्ट करती है, इसलिए यह Intel/AMD सर्वरों, Apple Silicon Mac और Raspberry Pi 4/5 जैसे ARM डिवाइसों पर नेटिव रूप से चलती है। VA-API, Quick Sync या OpenCL के ज़रिए Intel/AMD iGPU त्वरण आज AI इन्फ़रेंस के लिए सपोर्टेड नहीं है।

GPU सेटअप, Docker Compose उदाहरणों और वर्शन पिनिंग के लिए [Docker इमेज](./docker-tags) देखें।

## क्विक स्टार्ट (CPU) {#quick-start-cpu}

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

इसके बाद ऐप `http://localhost:1349` पर उपलब्ध होता है।

ऊपर का स्टैक डेटाबेस ओनर के रूप में कनेक्ट होता है। SnapOtter 2.3.0 से आप अनुरोधों को ऐसी रोल पर चला सकते हैं जो केवल पंक्तियाँ पढ़ और लिख सकती है; देखें [न्यूनतम-विशेषाधिकार रोल](./database#least-privilege-roles)।

> **Docker Hub की रेट लिमिट?** इसके बजाय GitHub Container Registry से पुल करने के लिए `snapotter/snapotter:latest` को `ghcr.io/snapotter-hq/snapotter:latest` से बदलें। दोनों रजिस्ट्री को हर रिलीज़ पर एक ही इमेज मिलती है।

## क्विक स्टार्ट (NVIDIA CUDA) {#quick-start-nvidia-cuda}

सपोर्टेड AI टूल (बैकग्राउंड रिमूवल, अपस्केलिंग, फ़ेस एन्हांसमेंट) पर NVIDIA CUDA त्वरण के लिए:

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

### GPU त्वरण सत्यापित करें {#verify-gpu-acceleration}

लॉग में CUDA की पहचान जाँचें:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

यदि `--gpus all` और NVIDIA Container Toolkit सही तरह से सेट होने के बावजूद AI टूल CPU पर चलते हैं, तो प्रभावित बंडल (उदाहरण के लिए Background Removal) को **Settings → AI Features** से दोबारा इंस्टॉल करें। इंस्टॉलर ONNX Runtime का GPU बिल्ड बहाल करता है, जिसे किसी अन्य बंडल (जैसे ट्रांसक्रिप्शन) द्वारा लाया गया CPU-only बिल्ड साझा AI एनवायरनमेंट में अन्यथा ढक सकता है। यदि किसी पुरानी इमेज पर UI से दोबारा इंस्टॉल करने से GPU बहाल नहीं होता, तो [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490) में मैन्युअल मरम्मत देखें।

## हार्डवेयर आवश्यकताएँ {#hardware-requirements}

ये संख्याएँ कई तरह के सिस्टमों पर बेंचमार्क से आई हैं, NVIDIA RTX 4070 वाले आधुनिक amd64 वर्कस्टेशन से लेकर Raspberry Pi तक। हर एक पर पूरा टूल कैटलॉग चलाया गया और असली न्यूनतम सीमा खोजने के लिए Docker रिसोर्स लिमिट बदली गईं।

इन टियर के छोटे सिरे पर चला रहे हैं (Pi, पुराना लैपटॉप, 2 GB का VPS)? [कम-संसाधन सेटअप](/hi/guide/low-resource) इन संख्याओं को ट्यून की गई सीमाओं के साथ एक ठोस वॉकथ्रू में बदलता है।

### त्वरित संदर्भ {#quick-reference}

| टियर | उपयोग | CPU | RAM | GPU | स्टोरेज |
|------|----------|-----|-----|-----|---------|
| न्यूनतम | गैर-AI टूल (इमेज, फ़ाइलें, हल्का PDF) और अंतर्निहित Fast OCR व फ़ेस डिटेक्शन; एकल उपयोगकर्ता; छोटे बैच | 2 कोर | 2 GB | कोई नहीं | ~7 GB |
| अनुशंसित | वीडियो, PDF और CPU पर मानक AI बंडल सहित सभी पाँच मोडैलिटी; बैच; कुछ उपयोगकर्ता | 4 कोर | 4 GB (HQ इनपेंटिंग के लिए 8 GB) | कोई नहीं | ~25 GB |
| पूर्ण | GPU AI सहित सब कुछ गति से; बड़े बैच; कई उपयोगकर्ता | 6-8 कोर | 8 GB | NVIDIA 8 GB+ VRAM (12 GB आरामदायक) | ~35 GB |

**आर्किटेक्चर: केवल 64-बिट** (`linux/amd64` या `linux/arm64`)। SnapOtter Intel/AMD सर्वरों, Apple Silicon Mac और **Raspberry Pi 4 और 5** (4-8 GB) सहित 64-बिट ARM बोर्डों पर नेटिव रूप से चलता है। यह 32-बिट ARM (`armv7`/`armhf`) पर नहीं चलता, क्योंकि उसके लिए कोई इमेज नहीं बनाई जाती, और न ही Pi Zero जैसे 512 MB-श्रेणी के बोर्डों पर, जो मेमोरी की न्यूनतम सीमा से नीचे हैं (नीचे देखें)।

### न्यूनतम (इमेज, फ़ाइलें और हल्के PDF टूल; AI नहीं) {#minimum-image-files-and-light-pdf-tools-no-ai}

| संसाधन | आवश्यकता |
|---|---|
| CPU | 2 कोर |
| RAM | 2 GB |
| डिस्क | ~5.5 GB (इमेज) + डेटा वॉल्यूम |
| GPU | आवश्यक नहीं |

सभी 222 गैर-AI कैटलॉग टूल, यानी इमेज (resize, crop, convert, compress, adjust, watermark), वीडियो (trim, mute, remux), ऑडियो (convert, normalize, trim), PDF (merge, split, compress, rotate, protect), फ़ाइल रूपांतरण और समर्पित रूपांतरण प्रीसेट, सामान्य हार्डवेयर पर चलते हैं। बड़ी फ़ाइल पर भी अधिकांश ऑपरेशन एक सेकंड से काफ़ी कम में पूरे हो जाते हैं: 2.7 MB की इमेज ~0.05 s में resize होती है और ~2 s में WebP में री-एन्कोड हो जाती है।

मेमोरी की सीमा वास्तविक है, Docker रिसोर्स-लिमिट स्वीप के अनुसार: **512 MB स्टैक शुरू नहीं कर सकता** (एक इमेज resize भी मार दिया जाता है), **1 GB** एकल-फ़ाइल ऑपरेशन संभालता है पर बहु-फ़ाइल बैच में मेमोरी खत्म हो जाती है, और **2 GB / 2 कोर** गैर-AI बैच को आराम से संभालने वाला सबसे छोटा कॉन्फ़िगरेशन है। अंतर्निहित Fast OCR और `face-detection` बंडल भी 2 GB के भीतर समा जाते हैं, जबकि बड़े AI बंडलों (Whisper, LaMa/DDColor, rembg, RealESRGAN, फ़ोटो रिस्टोरेशन और SD1.5 HQ इनपेंटिंग) को 4 से 8 GB RAM चाहिए और जब खाली मेमोरी उनके प्रति-बंडल न्यूनतम स्तर से कम हो तो उन्हें शुरू में ही अस्वीकार कर दिया जाता है।

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**वीडियो री-एन्कोडिंग अकेला CPU-भारी अपवाद है।** स्ट्रीम-कॉपी ऑपरेशन (trim, mute, कंटेनर remux) तुरंत होते हैं, लेकिन किसी दूसरे कोडेक में ट्रांसकोडिंग CPU-बाउंड है। 1080p / 45 सेकंड की क्लिप को VP9 (WebM) में री-एन्कोड करने में तेज़ आधुनिक CPU पर लगभग **~40 s**, Apple Silicon पर ~45 s, पुराने मोबाइल 4-कोर पर ~80 s, और पुराने 4-कोर सर्वर पर **~130 s** लगते हैं। यदि आपका वर्कलोड वीडियो-भारी है, तो CPU कोर और क्लॉक स्पीड को प्राथमिकता दें, या कंटेनर की `cpus:` सीमा बढ़ाएँ, क्योंकि भेजा गया compose ऐप को डिफ़ॉल्ट रूप से 4 कोर पर सीमित करता है (GPU compose पर 8)।

### अनुशंसित (CPU पर AI टूल) {#recommended-ai-tools-on-cpu}

| संसाधन | आवश्यकता |
|---|---|
| CPU | 4 कोर |
| RAM | 4 GB |
| डिस्क | 3 GB (इमेज) + लगभग 20 GB (सभी वैकल्पिक AI पैक) + वर्कस्पेस |
| GPU | आवश्यक नहीं (CPU फ़ॉलबैक) |

**बड़े AI बंडल इंस्टॉल करना और चलाना ही अनुशंसा को 4 GB RAM तक ले जाता है।** कोई वैकल्पिक पैक इंस्टॉल न होने पर ऐप निष्क्रिय अवस्था में लगभग 360 MB लेता है। पुराने Python टूल एक साइडकार साझा करते हैं, जबकि सटीक OCR सक्रिय अपरिवर्तनीय जनरेशन से पिन किया गया एक समर्पित, लंबे समय तक चलने वाला डिस्पैचर इस्तेमाल करता है। सक्रियण से पहले इंस्टॉलर उम्मीदवार पर स्मोक टेस्ट चलाता है। फिर वह परमाणु रूप से नए डिस्पैचर पर स्विच करता है और गार्बेज कलेक्शन से पहले पिछले डिस्पैचर को ड्रेन करता है। हर आधिकारिक सटीक-OCR आर्टिफ़ैक्ट को 4 GiB cgroup के भीतर अपना सबसे खराब स्थिति वाला रिलीज़ सूट पास करना होता है, जबकि 4 GB होस्ट की अनुशंसा Node.js ऐप्लिकेशन, Postgres, Redis, क्यू और समवर्ती कार्य के लिए गुंजाइश छोड़ती है।

अधिकांश AI टूल CPU पर पूरी तरह उपयोगी हैं; कुछ को सचमुच GPU चाहिए। आधुनिक 4-कोर CPU पर मापा गया:

| AI टूल | CPU समय | क्या CPU पर उपयोगी है? |
|---|---|---|
| फ़ेस डिटेक्शन (blur-faces, smart-crop, red-eye), noise-removal | 1 s से कम | हाँ |
| OCR, ट्रांसक्रिप्शन, सबटाइटल | 1-3 s | हाँ |
| Colorize, फ़ेस एन्हांसमेंट | ~10 s | हाँ |
| बैकग्राउंड रिमूवल / रिप्लेस / ब्लर | ~29 s | हाँ (इंतज़ार करना होगा) |
| AI अपस्केल (RealESRGAN) | छोटी पर ~33 s; बड़ी इमेज पर मिनट | सीमांत, GPU की पुरज़ोर सिफ़ारिश |
| फ़ोटो रिस्टोरेशन (पूरी पाइपलाइन) | कई मिनट | नहीं, GPU या तेज़ मल्टी-कोर CPU चाहिए |

SnapOtter जानबूझकर इन मॉडल डाउनलोड को Docker इमेज में शामिल नहीं करता। AI बंडल तभी पुल किए जाते हैं जब कोई एडमिन संबंधित टूल सक्षम करता है, वे स्थायी `/data/ai` वॉल्यूम में संग्रहीत होते हैं, और उसी मॉडल स्टैक पर निर्भर हर टूल उन्हें साझा करता है। इससे अंतिम कंटेनर इमेज छोटी रहती है, जबकि पूर्ण AI इंस्टॉलेशन नीचे दी गई बड़ी स्टोरेज संख्याओं तक पहुँच सकता है।

कुछ टूल एक से अधिक साझा बंडल पर निर्भर करते हैं। उदाहरण के लिए, Passport Photo को `background-removal` और `face-detection` दोनों चाहिए; यदि `background-removal` पहले से इंस्टॉल है, तो Passport Photo सक्षम करने पर केवल छूटा हुआ `face-detection` बंडल डाउनलोड होता है। यही पुन: उपयोग सभी AI टूल पर लागू होता है।

वैकल्पिक AI पैक का स्टोरेज और CPU मेमोरी की न्यूनतम सीमाएँ (SnapOtter Python साइडकार को भेजने से पहले उपलब्ध मेमोरी जाँचता है और बंडल की खाली-मेमोरी सीमा से नीचे के रन तुरंत अस्वीकार कर देता है):

| बंडल | डिस्क आकार | CPU मेमोरी न्यूनतम सीमा |
|---|---|---|
| फ़ेस डिटेक्शन | 200-300 MB | 2 GB होस्ट RAM (~0.5 GB खाली) |
| ट्रांसक्रिप्शन | ~600 MB | 4 GB होस्ट RAM (~2 GB खाली) |
| ऑब्जेक्ट इरेज़र + Colorize | 1-2 GB | 4 GB होस्ट RAM (~2 GB खाली) |
| सटीक OCR (`balanced`/`best`) | ~208-234 MiB डाउनलोड / ~409-488 MiB इंस्टॉल्ड | 4 GiB कॉन्फ़िगर की गई प्रभावी मेमोरी (`fast` 2 GB पर चलता है) |
| बैकग्राउंड रिमूवल | 4-5 GB | 4 GB होस्ट RAM (~2.5 GB खाली) |
| अपस्केल + फ़ेस एन्हांस + नॉइज़ रिमूवल | 5-6 GB | 4 GB होस्ट RAM (~2.5 GB खाली) |
| फ़ोटो रिस्टोरेशन | 4-5 GB | 4 GB होस्ट RAM (~3 GB खाली) |
| हाई-क्वालिटी इनपेंटिंग (`inpaint-hq`) | 5-7 GB | 8 GB होस्ट RAM (~6 GB खाली) |
| **सभी बंडल** | **~25 GB इंस्टॉल्ड** | **4 GB (`inpaint-hq` के साथ 8 GB)** |

Fast OCR Tesseract के ज़रिए इमेज में अंतर्निहित है, लगभग 25 MiB जोड़ता है, और इसे वैकल्पिक OCR पैक या उसकी 4 GiB मेमोरी आवश्यकता की ज़रूरत नहीं है। Fast `auto`, `en`, `de`, `es`, `fr`, `zh` और `ja` को सपोर्ट करता है, पर कोरियाई (`ko`) या अरबी (`ar`) को नहीं। दोनों `balanced` या `best` का उपयोग करते हैं और इसलिए सटीक पैक की आवश्यकता होती है। सटीक पैक आधिकारिक Linux amd64 और arm64 कंटेनरों में उपलब्ध है और CPU पर ONNX Runtime चलाता है। NVIDIA होस्ट उसी CPU OCR रनटाइम का उपयोग करते हैं, इसलिए OCR CUDA वर्शन या GPU आर्किटेक्चर पर निर्भर नहीं करता। सटीक रनटाइम को कम से कम 4 GiB प्रभावी मेमोरी चाहिए: कॉन्फ़िगर की गई कंटेनर cgroup सीमा, अन्यथा होस्ट मेमोरी। SnapOtter पैक डाउनलोड करने से पहले उस हस्ताक्षरित संगतता न्यूनतम से नीचे के सिस्टम को अस्वीकार कर देता है। बेयर-मेटल/प्रीबिल्ट आर्काइव पर भी सटीक-पैक इंस्टॉलेशन अस्वीकार किया जाता है, जिनका libc और Python ABI सुनिश्चित नहीं किया जा सकता। ऐसे असमर्थित होस्ट पर कोरियाई और अरबी OCR स्पष्ट असंगतता त्रुटि लौटाते हैं और चुपचाप Fast पर नहीं लौटते। कोरियाई के लिए स्पष्ट Fast अनुरोध जॉब के क्यू में जाने से पहले `fast-korean-unsupported` कारण के साथ `FEATURE_INCOMPATIBLE` लौटाता है।

जो रेप्लिका एक ही `DATA_DIR` साझा करती हैं उनका CPU आर्किटेक्चर एक ही होना चाहिए; मल्टी-रेप्लिका डिप्लॉयमेंट को नोड एफ़िनिटी से पिन करें। मिश्रित amd64/arm64 रेप्लिका को अलग डेटा वॉल्यूम और स्वतंत्र SnapOtter डिप्लॉयमेंट चाहिए।

सटीक रनटाइम एक सक्रिय जनरेशन रखता है और सक्रियण के बाद अपना डाउनलोड कैश साफ़ कर देता है। इस रिलीज़ के लिए, पहले इंस्टॉल में आर्काइव और स्टेजिंग के लिए अस्थायी रूप से लगभग 620-720 MiB चाहिए, और अपग्रेड में, जब तक पुरानी जनरेशन सक्रिय रहती है, चरम लगभग 1.2 GiB के पास पहुँच सकता है। इंस्टॉलर डाउनलोड या एक्सट्रैक्ट करने से पहले हस्ताक्षरित इंडेक्स और मौजूदा जनरेशन से सटीक आवश्यकता निकालता है, और यदि डेटा वॉल्यूम बहुत छोटा हो तो जल्दी विफल हो जाता है।

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### पूर्ण (NVIDIA CUDA पर AI टूल) {#full-ai-tools-on-nvidia-cuda}

| संसाधन | आवश्यकता |
|---|---|
| CPU | 6-8 कोर (GPU AI के साथ भी वीडियो तैयारी और समवर्तिता CPU पर चलती है) |
| RAM | 8 GB |
| GPU | 8+ GB VRAM वाला NVIDIA (12 GB अनुशंसित) |
| डिस्क | कुल ~35 GB |

NVIDIA GPU (CUDA) भारी AI मॉडलों को नाटकीय रूप से तेज़ करता है। आधुनिक CPU की तुलना में RTX 4070 पर मापा गया:

| AI टूल | GPU से गति-वृद्धि | टिप्पणी |
|---|---|---|
| AI अपस्केल (RealESRGAN 2×) | **~47×** | सबसे बड़ा लाभ, एक सेकंड से कम बनाम ~33 s (बड़ी इमेज पर मिनट) |
| फ़ेस एन्हांसमेंट (CodeFormer) | **~12×** | ~0.9 s बनाम ~11 s |
| ट्रांसक्रिप्शन (Whisper) | ~4.5× | |
| बैकग्राउंड रिमूवल / रिप्लेस / ब्लर | ~4× | GPU पर ~7 s बनाम CPU पर ~29 s |
| Colorize | ~1.8× | |
| OCR, फ़ेस डिटेक्शन, red-eye, noise-removal | ~1× | CPU पर पहले से तेज़, GPU से मदद नहीं मिलती |
| फ़ोटो रिस्टोरेशन | कोई नहीं | GPU पर भी CPU-बाउंड (0% GPU उपयोग); यहाँ GPU से ज़्यादा तेज़ CPU मायने रखता है |

GPU के लायक टूल **अपस्केल, फ़ेस एन्हांसमेंट, ट्रांसक्रिप्शन और बैकग्राउंड रिमूवल** हैं। फ़ेस डिटेक्शन, OCR और red-eye CPU-बाउंड हैं और पहले से तेज़ हैं, इसलिए GPU कुछ नहीं जोड़ता।

फ़ेस एन्हांसमेंट के साथ अपस्केल के दौरान VRAM का चरम उपयोग 7.5 GB तक पहुँचता है। 6 GB का NVIDIA GPU अधिकांश AI टूल के लिए अलग-अलग काम करता है लेकिन अपस्केल पर विफल होगा। 8-12 GB VRAM सब कुछ संभाल लेता है।

VA-API, Quick Sync या OpenCL के ज़रिए Intel/AMD iGPU त्वरण आज AI इन्फ़रेंस के लिए सपोर्टेड नहीं है। कंटेनर में `/dev/dri` मैप करने से AI GPU त्वरण सक्षम नहीं होता; जब तक NVIDIA CUDA उपलब्ध न हो, SnapOtter AI टूल CPU पर चलाएगा।

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

### समवर्ती उपयोगकर्ता {#concurrent-users}

डिफ़ॉल्ट 4-कोर-सीमित ऐप कंटेनर पर समानांतर इमेज-resize अनुरोध:

| समवर्ती अनुरोध | औसत प्रतिक्रिया समय | त्रुटियाँ |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

वर्कर पूल के संतृप्त होने पर भी प्रतिक्रिया समय बिना त्रुटि के उप-रैखिक रूप से बढ़ता है। ऐप कंटेनर की `cpus:` सीमा बढ़ाने (या अधिक कोर वाले होस्ट का उपयोग करने) से यह सीमा ऊपर उठती है। ध्यान दें कि भारी जॉब (वीडियो ट्रांसकोड, CPU AI) अपनी पूरी अवधि के लिए एक वर्कर को रोके रखते हैं, इसलिए CPU का आकार केवल अनुरोधों की संख्या के आधार पर नहीं, बल्कि अपेक्षित समवर्ती भारी जॉब की संख्या के आधार पर तय करें।

### सपोर्टेड इमेज फ़ॉर्मेट {#supported-image-formats}

SnapOtter **55+ इनपुट फ़ॉर्मेट** और **14 आउटपुट फ़ॉर्मेट** सपोर्ट करता है, जिनमें 20+ कैमरा ब्रांड की RAW फ़ाइलें, पेशेवर फ़ॉर्मेट (PSD, EPS, OpenEXR, HDR), आधुनिक कोडेक (JPEG XL, AVIF, HEIC, QOI), और वैज्ञानिक/गेमिंग फ़ॉर्मेट (FITS, DDS) शामिल हैं।

हर सपोर्टेड फ़ॉर्मेट, उपयोग किए गए डिकोडर और उपलब्ध क्वालिटी नियंत्रणों के विवरण के लिए [पूरी फ़ॉर्मेट सूची](/hi/guide/supported-formats) देखें।

### ज्ञात सीमाएँ {#known-limitations}

- **Content-aware resize** बड़ी इमेज (>5 MP) पर caire बाइनरी की एक सीमा के कारण क्रैश होता है। छोटी इमेज के साथ ठीक काम करता है।
- **HEIF decode** में 13-23 सेकंड लगते हैं। HEIC (Apple का वेरिएंट) कहीं तेज़ है, 0.3-0.9 सेकंड।
- **Upscale** CPU पर छोटी इमेज से बड़ी किसी भी चीज़ के लिए टाइमआउट हो जाता है। व्यावहारिक उपयोग के लिए GPU आवश्यक है।
- **CodeFormer** फ़ेस एन्हांसमेंट GFPGAN से काफ़ी धीमा है (GPU पर 53s बनाम 2s)। अधिकांश उपयोग के लिए GFPGAN की सिफ़ारिश की जाती है।

## वॉल्यूम {#volumes}

| माउंट / वॉल्यूम | उद्देश्य | आवश्यक? |
|---|---|---|
| `/data` (app) | AI मॉडल, Python venv, उपयोगकर्ता फ़ाइलें | **हाँ** - इसके बिना फ़ाइलें खो जाती हैं |
| `/tmp/workspace` (app) | अस्थायी प्रोसेसिंग फ़ाइलें (अपने आप साफ़ होती हैं) | अनुशंसित |
| `SnapOtter-pgdata` (postgres) | PostgreSQL डेटा डायरेक्टरी (उपयोगकर्ता, सेटिंग, पाइपलाइन, जॉब) | **हाँ** - इसके बिना डेटा खो जाता है |
| `SnapOtter-redisdata` (redis) | टिकाऊ जॉब क्यू के लिए Redis append-only फ़ाइल | अनुशंसित |

### बाइंड माउंट बनाम नामित वॉल्यूम {#bind-mounts-vs-named-volumes}

**नामित वॉल्यूम** (अनुशंसित) : Docker अनुमतियाँ अपने आप प्रबंधित करता है:
```yaml
volumes:
  - SnapOtter-data:/data
```

**बाइंड माउंट** : अनुमतियाँ आप प्रबंधित करते हैं। `PUID`/`PGID` को अपने होस्ट उपयोगकर्ता से मिलाने के लिए सेट करें:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### स्टोरेज अनुमतियाँ {#storage-permissions}

SnapOtter रनटाइम पर दो स्थानों में लिखता है: `/data` (उपयोगकर्ता फ़ाइलें, लॉग, AI मॉडल और Python venv) और `/tmp/workspace` (अस्थायी प्रोसेसिंग स्क्रैच)। दोनों उस उपयोगकर्ता द्वारा लिखने योग्य होने चाहिए जिसके रूप में कंटेनर चलता है। यदि कोई एक नहीं है, तो कंटेनर **स्टार्टअप पर तुरंत विफल हो जाता है** और एक संदेश देता है जिसमें डायरेक्टरी का नाम, चल रहा UID/GID, और इसे कैसे ठीक करें बताया जाता है, बजाय इसके कि वह "healthy" दिखाकर बूट हो और फिर पहले अपलोड पर किसी रहस्यमय त्रुटि से विफल हो। लॉग डायरेक्टरी (`LOG_DIR`, इमेज में `/data/logs`) की भी हर स्टोरेज मोड में इसी तरह जाँच होती है, क्योंकि फ़ाइलें S3 में होने पर भी लॉग स्थानीय रहते हैं।

अनुमतियाँ कैसे संभाली जाती हैं, यह इस पर निर्भर करता है कि कंटेनर कैसे लॉन्च किया गया है:

**डिफ़ॉल्ट (root के रूप में शुरू होता है, `snapotter` पर उतर आता है)** : एंट्रीपॉइंट root के रूप में शुरू होता है, माउंट किए गए वॉल्यूम का स्वामित्व ठीक करता है, फिर `gosu` के ज़रिए बिना विशेषाधिकार वाले `snapotter` उपयोगकर्ता पर आ जाता है। नामित वॉल्यूम बिना किसी कॉन्फ़िगरेशन के काम करते हैं। बाइंड माउंट के लिए, `PUID`/`PGID` को अपने होस्ट उपयोगकर्ता पर सेट करें (ऊपर) ताकि यह जो फ़ाइलें लिखता है उनका स्वामित्व आपके पास रहे।

**Kubernetes / OpenShift (`runAsUser` के ज़रिए non-root)** : सीधे non-root उपयोगकर्ता के रूप में लॉन्च होने पर कंटेनर वॉल्यूम पर खुद chown नहीं कर सकता, इसलिए ऑर्केस्ट्रेटर को उन्हें लिखने योग्य बनाना होगा। `fsGroup` सेट करें:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

इमेज की लिखने योग्य डायरेक्टरी का ग्रुप-स्वामी GID 0 है और वे ग्रुप-लिखने योग्य हैं, इसलिए **मनमाने UID** और root सप्लीमेंटरी ग्रुप (OpenShift का डिफ़ॉल्ट) के साथ चल रहा पॉड बिना `chown` के लिख सकता है।

**TrueNAS Scale (और अन्य "फ़ॉरेन UID" सेटअप)** : TrueNAS ऐप्स को non-root उपयोगकर्ता (अक्सर `568:568`) के रूप में चलाता है और किसी भिन्न उपयोगकर्ता के स्वामित्व वाले होस्ट डेटासेट माउंट करता है, इसलिए न एंट्रीपॉइंट और न `fsGroup` अकेले उन्हें लिखने योग्य बनाता है। इनमें से एक चुनें:

- **ऐप को root के रूप में चलाएँ** (अनुशंसित) : ऐप का उपयोगकर्ता अनसेट छोड़ें या उसे `0` पर सेट करें, और डिफ़ॉल्ट एंट्रीपॉइंट को अनुमतियाँ ठीक करने और `snapotter` पर उतरने दें।
- **UID `999` के रूप में चलाएँ** : ऐप का उपयोगकर्ता/ग्रुप `999:999` (SnapOtter का अंतर्निहित `snapotter` उपयोगकर्ता) पर सेट करें ताकि वह इमेज के स्वामित्व से मेल खाए।
- **होस्ट डेटासेट पर `chown` करें**, उस UID के लिए जिसके रूप में कंटेनर चलता है, TrueNAS शेल से:

  ```bash
  # स्टार्टअप त्रुटि से UID का उपयोग करें (या कंटेनर के अंदर `id` चलाएँ)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

स्टार्टअप त्रुटि उपयोग करने के लिए सटीक UID बताती है, इसलिए सबसे तेज़ रास्ता ऐप को एक बार शुरू करना, संदेश पढ़ना, और फिर उसी के अनुसार `chown` (या उपयोगकर्ता समायोजित) करना है।

## एनवायरनमेंट वेरिएबल {#environment-variables}

| वेरिएबल | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `AUTH_ENABLED` | `true` | लॉगिन आवश्यकता सक्षम/अक्षम करें |
| `DEFAULT_USERNAME` | `admin` | प्रारंभिक एडमिन उपयोगकर्ता नाम |
| `DEFAULT_PASSWORD` | `admin` | प्रारंभिक एडमिन पासवर्ड (पहले लॉगिन पर बदलना अनिवार्य) |
| `MAX_UPLOAD_SIZE_MB` | `0` (असीमित) | MB में प्रति-फ़ाइल अपलोड सीमा। इमेज `0` के साथ आती है; सोर्स बिल्ड 100 से शुरू होता है |
| `MAX_BATCH_SIZE` | `0` (असीमित) | प्रति बैच अनुरोध अधिकतम फ़ाइलें। इमेज `0` के साथ आती है; सोर्स बिल्ड 100 से शुरू होता है |
| `RATE_LIMIT_PER_MIN` | `1000` | प्रति IP प्रति मिनट API अनुरोध (अक्षम करने के लिए 0 सेट करें) |
| `MAX_USERS` | `0` (असीमित) | अधिकतम उपयोगकर्ता खाते |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | कौन से पीयर `X-Forwarded-For` के ज़रिए क्लाइंट IP सेट कर सकते हैं। डिफ़ॉल्ट रूप से केवल निजी नेटवर्क |
| `PUID` | `999` | इस UID के रूप में चलाएँ (बाइंड माउंट अनुमतियों के लिए) |
| `PGID` | `999` | इस GID के रूप में चलाएँ (बाइंड माउंट अनुमतियों के लिए) |
| `LOG_LEVEL` | `info` | लॉग विस्तार: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (अपने आप) | अधिकतम समानांतर AI प्रोसेसिंग जॉब |
| `SESSION_DURATION_HOURS` | `168` | लॉगिन सेशन की अवधि (7 दिन) |
| `CORS_ORIGIN` | (खाली) | अल्पविराम से अलग की गई अनुमत ऑरिजिन, या समान-ऑरिजिन के लिए खाली |

### आउटबाउंड प्रॉक्सी और निजी CA {#outbound-proxy-and-private-ca}

आधिकारिक कंटेनर Node का एनवायरनमेंट-प्रॉक्सी सपोर्ट सक्षम करता है। यदि SnapOtter को OCR रनटाइम रिपॉज़िटरी या अन्य HTTPS सेवाओं तक कॉर्पोरेट प्रॉक्सी के ज़रिए पहुँचना है, तो `HTTPS_PROXY` सेट करें (और ज़रूरत हो तो `HTTP_PROXY`)। `NO_PROXY` को उन होस्ट की अल्पविराम-पृथक सूची पर सेट करें जिन तक सीधे पहुँचना चाहिए, जैसे Postgres, Redis और आंतरिक ऑब्जेक्ट स्टोरेज।

यदि प्रॉक्सी या कोई आंतरिक सेवा निजी सर्टिफ़िकेट अथॉरिटी द्वारा हस्ताक्षरित है, तो CA सर्टिफ़िकेट को केवल-पढ़ने के रूप में माउंट करें और `NODE_EXTRA_CA_CERTS` को उस पर इंगित करें। Node प्रोसेस के शुरू होने पर फ़ाइल मौजूद होनी चाहिए:

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

प्रॉक्सी क्रेडेंशियल को Compose फ़ाइल से बाहर रखें (उदाहरण के लिए किसी सुरक्षित `.env` फ़ाइल या सीक्रेट में)। TLS सत्यापन अक्षम न करें: हस्ताक्षरित OCR इंडेक्स रिलीज़ मेटाडेटा को प्रमाणित करता है, जबकि सामान्य TLS सत्यापन ट्रांसपोर्ट और हर अन्य आउटबाउंड अनुरोध की सुरक्षा करता रहता है।

## हेल्थ चेक {#health-check}

कंटेनर में एक अंतर्निहित हेल्थ चेक शामिल है:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## रिवर्स प्रॉक्सी {#reverse-proxy}

`TRUST_PROXY` का डिफ़ॉल्ट `loopback,linklocal,uniquelocal` है, इसलिए SnapOtter `X-Forwarded-For` पर केवल निजी नेटवर्क के किसी पीयर से ही भरोसा करता है। उसी होस्ट पर, किसी Docker नेटवर्क पर या आपके LAN पर मौजूद रिवर्स प्रॉक्सी पर बॉक्स से बाहर ही भरोसा किया जाता है, यानी रेट लिमिटिंग, लॉगिन ब्रूट-फ़ोर्स लिमिटर, ऑडिट लॉग और एंटरप्राइज़ IP अनुमति-सूची, सभी बिना किसी कॉन्फ़िगरेशन के असली क्लाइंट IP देखते हैं।

`TRUST_PROXY=true` तभी सेट करें जब सामने का प्रॉक्सी SnapOtter तक किसी **सार्वजनिक** पते से पहुँचता हो, उदाहरण के लिए किसी अलग नेटवर्क पर क्लाउड लोड बैलेंसर। सीधे उजागर इंस्टेंस पर वह मान `request.ip` को हमलावर-नियंत्रित बना देता है, क्योंकि हेडर बदलते रहने वाले कॉलर को हर अनुरोध पर नई रेट-लिमिट बकेट मिल जाती है।

क्लाइंट IP मापने जाने से पहले दो बातें जान लें। macOS और Windows पर Docker Desktop प्रकाशित पोर्ट को यूज़रलैंड प्रॉक्सी से सर्व करता है जो हर सोर्स पते को VM गेटवे `192.168.65.1` में बदल देती है, इसलिए `TRUST_PROXY` का कोई भी मान वहाँ असली क्लाइंट को वापस नहीं लाता; इंटरनेट-फ़ेसिंग किसी भी चीज़ के लिए Linux पर डिप्लॉय करें। और किसी भी प्लेटफ़ॉर्म पर, `localhost` के ज़रिए प्रकाशित पोर्ट तक पहुँचना आपके क्लाइंट के रूप में नहीं बल्कि ब्रिज गेटवे के रूप में देखा जाता है, इसलिए localhost टेस्ट से यह पता नहीं चलता कि असली क्लाइंट को कैसे पहचाना जाता है। `TRUST_PROXY` मानों की पूरी तालिका और Docker Desktop की चेतावनी [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy) में हैं।

नीचे के हर प्रॉक्सी के लिए दो बातें मायने रखती हैं: बड़ी रिक्वेस्ट बॉडी (अपलोड) की अनुमति दें, और प्रतिक्रियाओं को बफ़र न करें। प्रतिक्रिया बफ़र करने वाला प्रॉक्सी SSE प्रगति को तोड़ देता है और, और भी साफ़ तौर पर, बड़ी फ़ाइल डाउनलोड को "शुरू होता है पर कभी खत्म नहीं होता" बना देता है, क्योंकि प्रॉक्सी पूरी फ़ाइल को आगे भेजने से पहले अपने पास रोके रखता है। SnapOtter डाउनलोड पर `X-Accel-Buffering: no` भेजता है ताकि कहीं और बफ़रिंग चालू रहने पर भी nginx उन्हें स्ट्रीम करे, लेकिन nginx के अलावा अन्य प्रॉक्सी में प्रतिक्रिया बफ़रिंग स्पष्ट रूप से अक्षम करनी पड़ती है (नीचे हर कॉन्फ़िग में दिखाया गया है)। यदि कोई डाउनलोड बीच में अटक जाए, तो सामने बफ़र करता प्रॉक्सी सबसे पहले जाँचने की चीज़ है।

HSTS पर एक टिप्पणी: API हर प्रतिक्रिया पर खुद `Strict-Transport-Security` भेजता है, इसलिए जो प्रॉक्सी प्रतिक्रिया हेडर आगे पास करता है (नीचे के सभी कॉन्फ़िग करते हैं) उसे अपना कोई HSTS सेटअप नहीं चाहिए। केवल तब जब आपका प्रॉक्सी अपस्ट्रीम प्रतिक्रिया हेडर हटाने या ओवरराइड करने के लिए कॉन्फ़िगर किया गया हो, आपको हेडर सुरक्षित रखना या उसे एज पर दोबारा जोड़ना होगा।

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

### सबपाथ के अंतर्गत डिप्लॉय करना {#subpath}

`https://example.com/snapotter` पर सर्व करने के लिए, SnapOtter कंटेनर एनवायरनमेंट में `BASE_PATH=/snapotter` सेट करें और उसे रीस्टार्ट करें। आधिकारिक CPU और GPU Compose फ़ाइलें भी आपके शेल या Compose `.env` फ़ाइल से `BASE_PATH` स्वीकार करती हैं। वही इमेज किसी भी पाथ पर काम करती है; फ्रंटएंड को दोबारा बिल्ड करने की ज़रूरत नहीं है।

`BASE_PATH` अक्षरों, अंकों, `_` या `-` वाले स्लैश-पृथक सेगमेंट स्वीकार करता है, जिनमें `/apps/snapotter` जैसे नेस्टेड पाथ भी शामिल हैं। अंत में स्लैश वैकल्पिक है। रूट डिप्लॉयमेंट के लिए इसे खाली छोड़ें (डिफ़ॉल्ट), या `/` सेट करें।

अपने मौजूदा Nginx HTTPS सर्वर ब्लॉक में यह इस्तेमाल करें:

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

यह उदाहरण प्रीफ़िक्स को बनाए रखता है। जो प्रॉक्सी फ़ॉरवर्ड करने से पहले `/snapotter` हटा देते हैं वे भी सपोर्टेड हैं। आंतरिक हेल्थ चेक `/api/v1/health` का उपयोग जारी रख सकते हैं। OIDC या SAML के लिए, `EXTERNAL_URL=https://example.com/snapotter` भी सेट करें और आइडेंटिटी प्रोवाइडर के कॉलबैक URL को अपडेट करें ताकि उनमें क्रमशः `/snapotter/api/auth/oidc/callback` या `/snapotter/api/auth/saml/callback` शामिल हो।

API स्क्रिप्ट बिना बदलाव के काम करती रहती हैं: API प्रतिक्रियाओं में URL, जैसे किसी टूल का `downloadUrl`, `BASE_PATH` चाहे जो हो, `/api/` से शुरू होते हैं। उन्हें डोमेन रूट के विरुद्ध हल करने के बजाय अपने इंस्टेंस के बेस URL (`https://example.com/snapotter` + `/api/v1/download/...`) में जोड़ें।

UI को प्रीफ़िक्स वाले URL (`https://example.com/snapotter`) से खोलें। प्रीफ़िक्स के बिना आने वाला ब्राउज़र अपने आप वहाँ भेज दिया जाता है; केवल API अनुरोधों से ही अपेक्षा है कि वे बिना प्रीफ़िक्स के ऐप तक पहुँचें। यदि लॉग में `Requests arrive under /snapotter/ but BASE_PATH is empty` दिखे, तो आपका प्रॉक्सी ऐसा प्रीफ़िक्स फ़ॉरवर्ड कर रहा है जिसे `BASE_PATH` घोषित नहीं करता: `BASE_PATH` को उस पर सेट करें, या प्रॉक्सी पर प्रीफ़िक्स हटा दें।

### Nginx Proxy Manager {#nginx-proxy-manager}

1. नया Proxy Host जोड़ें
2. Domain Name को अपने डोमेन पर सेट करें
3. Scheme को `http` पर, Forward Hostname को `SnapOtter` (या आपके कंटेनर IP) पर, Forward Port को `1349` पर सेट करें
4. WebSocket सपोर्ट सक्षम करें
5. Advanced के अंतर्गत जोड़ें: `client_max_body_size 500M;` और `proxy_buffering off;`

API का `Strict-Transport-Security` हेडर NPM से जस का तस गुज़रता है; SSL टैब पर HSTS टॉगल उसके ऊपर वैकल्पिक है।

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

Traefik अपस्ट्रीम प्रतिक्रिया हेडर को बिना बदले आगे भेजता है, इसलिए API का `Strict-Transport-Security` हेडर `headers` मिडलवेयर के बिना ब्राउज़र तक पहुँचता है। यदि आप पहले से ऐसा मिडलवेयर चलाते हैं जो प्रतिक्रिया हेडर को फिर से लिखता है, तो सुनिश्चित करें कि वह उस हेडर को अछूता छोड़ता है।

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

`flush_interval -1` प्रतिक्रिया बफ़रिंग अक्षम करता है, जो SSE प्रगति इवेंट (बैच प्रोसेसिंग, AI टूल, फ़ीचर इंस्टॉल) के लिए और बड़ी फ़ाइल डाउनलोड के अटकने के बजाय स्ट्रीम होने के लिए आवश्यक है। बढ़ाए गए टाइमआउट बड़े फ़ाइल अपलोड को Caddy द्वारा कनेक्शन जल्दी बंद किए बिना पूरा होने देते हैं। Caddy API के `Strict-Transport-Security` हेडर को भी बिना छुए आगे भेजता है, इसलिए HSTS के लिए किसी `header` डायरेक्टिव की ज़रूरत नहीं है।

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

ध्यान दें: Cloudflare के फ़्री प्लान पर 100 MB की अपलोड सीमा है। मिलान के लिए `MAX_UPLOAD_SIZE_MB=100` सेट करें।

टनल API के प्रतिक्रिया हेडर, `Strict-Transport-Security` सहित, आगे भेजता है, इसलिए किसी डैशबोर्ड HSTS कॉन्फ़िगरेशन की ज़रूरत नहीं है (Cloudflare की अपनी एज HSTS सेटिंग उसके ऊपर वैकल्पिक है)।

## समस्या निवारण {#troubleshooting}

### विफल पहले स्टार्ट के तुरंत बाद "Postgres not reachable: EAI_AGAIN" {#eai-again-after-failed-first-start}

यदि बिल्कुल पहला `docker compose up -d` बीच में विफल हो जाता है (आमतौर पर कारण पहले से उपयोग में आया पोर्ट होता है), तो साधारण `up -d` दोबारा चलाने पर ऐप कंटेनर compose नेटवर्क से जुड़े बिना शुरू हो सकता है। तब ऐप इस त्रुटि के साथ क्रैश-लूप में चला जाता है:

```
Postgres not reachable: EAI_AGAIN
```

जबकि `docker ps` postgres को healthy दिखाता है। त्रुटि वास्तविक है पर गलत कंटेनर की ओर इशारा करती है: नेटवर्क के बिना `postgres` होस्टनेम के लिए DNS बिल्कुल हल नहीं हो सकता, और रीस्टार्ट पॉलिसी वही विफलता बार-बार दोहराती रहती है।

जिस भी चीज़ ने पहला स्टार्ट तोड़ा उसे ठीक करें (आमतौर पर: पोर्ट खाली करें), फिर ऐप कंटेनर को दोबारा बनाने के लिए बाध्य करें ताकि वह नेटवर्क से फिर जुड़ जाए:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: अन्य डिवाइसों से पहुँच योग्य, PC से स्वयं नहीं {#windows-wsl2-loopback}

WSL2 के अंदर Docker चलने पर (सामान्य Windows सेटअप), स्टैक आपके नेटवर्क की हर दूसरी मशीन से पहुँच योग्य हो सकता है, जबकि Windows होस्ट पर `http://localhost:1349` टाइमआउट हो जाता है, भले ही WSL का mirrored networking मोड सक्षम हो। पोर्ट Windows `netstat` में कभी दिखता नहीं, और कंटेनरों में कुछ गड़बड़ नहीं है।

ऐप को किसी दूसरे डिवाइस से खोलें, या डिस्ट्रो के अंदर से उसके अपने पते (WSL शेल में `hostname -I`) का उपयोग करके। यदि आपके WSL वर्शन पर localhost फ़ॉरवर्डिंग संयोग से काम करती है, तो इसे बोनस मानें, भरोसा करने की चीज़ नहीं।

## CI/CD {#ci-cd}

GitHub रिपॉज़िटरी में तीन वर्कफ़्लो हैं:

- **ci.yml** : हर push और PR पर अपने आप चलता है। Lint, टाइपचेक, टेस्ट, बिल्ड करता है और Docker इमेज को (बिना push किए) मान्य करता है।
- **release.yml** : `workflow_dispatch` के ज़रिए मैन्युअल रूप से ट्रिगर होता है। वर्शन टैग और GitHub रिलीज़ बनाने के लिए semantic-release चलाता है, फिर मल्टी-आर्क Docker इमेज (amd64 + arm64) बनाता है और Docker Hub (`snapotter/snapotter`) तथा GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`) पर push करता है।
- **deploy-docs.yml** : `main` पर push होने पर यह डॉक्यूमेंटेशन साइट बनाता है और उसे Cloudflare Pages पर डिप्लॉय करता है।

रिलीज़ बनाने के लिए, GitHub UI में **Actions > Release > Run workflow** पर जाएँ, या चलाएँ:

```bash
gh workflow run release.yml
```

Semantic-release कमिट इतिहास से वर्शन तय करता है। `latest` Docker टैग हमेशा सबसे हालिया रिलीज़ की ओर इशारा करता है।

## एनालिटिक्स {#analytics}

SnapOtter में बग पकड़ने और फ़ीचर सुधारने में मदद के लिए गुमनाम प्रोडक्ट एनालिटिक्स (टूल उपयोग पैटर्न, त्रुटि रिपोर्ट) शामिल है। यह डिफ़ॉल्ट रूप से चालू है। आपकी फ़ाइलें, फ़ाइल नाम और व्यक्तिगत डेटा इसका हिस्सा कभी नहीं होते। एनालिटिक्स अक्षम होने पर SnapOtter सामान्य रूप से काम करता है।

### एनालिटिक्स अक्षम करना {#disabling-analytics}

रनटाइम ऑप्ट-आउट एक-क्लिक एडमिन टॉगल है। Settings > System > Privacy खोलें और Anonymous Product Analytics बंद करें। यह पूरे इंस्टेंस के लिए तुरंत रुक जाता है, किसी रीबिल्ड की ज़रूरत नहीं।

ऐसी इमेज के लिए जो कभी एनालिटिक्स उत्सर्जित नहीं कर सकती, रिपॉज़िटरी क्लोन करके और रीबिल्ड करके बिल्ड-टाइम हार्ड-ऑफ़ सेट करें:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

या अपने मौजूदा `docker-compose.yml` में बिल्ड आर्ग जोड़ें:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```

