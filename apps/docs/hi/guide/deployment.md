---
description: "SnapOtter को Docker के साथ प्रोडक्शन में डिप्लॉय करें। हार्डवेयर आवश्यकताएँ, GPU सेटअप, और Nginx, Traefik, तथा Cloudflare के लिए रिवर्स प्रॉक्सी कॉन्फ़िग।"
i18n_output_hash: 23f4f331a239
i18n_source_hash: e0d8d5f6fc87
i18n_provenance: human
---

# Deployment {#deployment}

SnapOtter एक 3-कंटेनर Docker Compose स्टैक के रूप में डिप्लॉय होता है: SnapOtter ऐप इमेज, PostgreSQL 17, और Redis 8। ऐप इमेज **linux/amd64** (AI त्वरण के लिए NVIDIA CUDA के साथ) और **linux/arm64** (CPU) को सपोर्ट करती है, इसलिए यह Intel/AMD सर्वरों, Apple Silicon Macs, और Raspberry Pi 4/5 जैसे ARM डिवाइसों पर मूल रूप से चलती है। VA-API, Quick Sync, या OpenCL के माध्यम से Intel/AMD iGPU त्वरण आज AI इन्फ़रेंस के लिए सपोर्ट नहीं किया जाता।

GPU सेटअप, Docker Compose उदाहरणों, और वर्शन पिनिंग के लिए [Docker Image](./docker-tags) देखें।


<!-- korean-ocr-contract:start -->
::: info कोरियाई OCR संगतता
तेज़ OCR `auto`, `en`, `de`, `es`, `fr`, `zh` और `ja` का समर्थन करता है, लेकिन कोरियाई (`ko`) का नहीं। कोरियाई के लिए सटीक OCR पैक और `balanced` या `best` आवश्यक है। पैक आधिकारिक Linux amd64 और arm64 कंटेनरों पर चलता है; NVIDIA होस्ट पर भी OCR CPU पर ही चलता है। असमर्थित सिस्टम स्पष्ट संगतता त्रुटि लौटाते हैं और चुपचाप `fast` पर वापस नहीं जाते। कोरियाई के साथ `fast` या पुराने `tesseract` नाम को कतार में डालने से पहले `FEATURE_INCOMPATIBLE` और `fast-korean-unsupported` के साथ अस्वीकार किया जाता है।
:::
<!-- korean-ocr-contract:end -->
## Quick Start (CPU) {#quick-start-cpu}

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

इसके बाद ऐप `http://localhost:1349` पर उपलब्ध होता है।

> **Docker Hub रेट लिमिट?** GitHub Container Registry से पुल करने के लिए `snapotter/snapotter:latest` को `ghcr.io/snapotter-hq/snapotter:latest` से बदलें। दोनों रजिस्ट्री हर रिलीज़ पर वही इमेज प्राप्त करती हैं।

## Quick Start (NVIDIA CUDA) {#quick-start-nvidia-cuda}

समर्थित AI टूल पर NVIDIA CUDA त्वरण के लिए (पृष्ठभूमि हटाना, अपस्केलिंग, चेहरा निखारना):

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

लॉग में CUDA डिटेक्शन की जाँच करें:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Hardware Requirements {#hardware-requirements}

ये संख्याएँ कई तरह के सिस्टमों पर किए गए बेंचमार्क से आती हैं, एक आधुनिक amd64 वर्कस्टेशन (NVIDIA RTX 4070 के साथ) से लेकर एक Raspberry Pi तक, जिनमें से हर एक पर पूरा टूल कैटलॉग चलाया गया और असली न्यूनतम सीमा खोजने के लिए Docker रिसोर्स लिमिट को स्वीप किया गया।

### Quick Reference {#quick-reference}

| टियर | उपयोग परिदृश्य | CPU | RAM | GPU | स्टोरेज |
|------|----------|-----|-----|-----|---------|
| न्यूनतम | इमेज, फ़ाइलें, और हल्के PDF टूल; एकल उपयोगकर्ता; छोटे बैच | 2 कोर | 2 GB | कोई नहीं | ~7 GB |
| अनुशंसित | वीडियो, PDF, और CPU पर AI सहित सभी पाँच मोडैलिटी; बैच; कुछ उपयोगकर्ता | 4 कोर | 4 GB | कोई नहीं | ~25 GB |
| पूर्ण | GPU AI सहित सब कुछ तेज़ गति से; बड़े बैच; अनेक उपयोगकर्ता | 6-8 कोर | 8 GB | NVIDIA 8 GB+ VRAM (12 GB आरामदायक) | ~35 GB |

**आर्किटेक्चर: केवल 64-बिट** (`linux/amd64` या `linux/arm64`)। SnapOtter Intel/AMD सर्वरों, Apple Silicon Macs, और 64-बिट ARM बोर्डों पर मूल रूप से चलता है, जिनमें **Raspberry Pi 4 और 5** (4-8 GB) शामिल हैं। यह 32-बिट ARM (`armv7`/`armhf`) पर **नहीं** चलता, इसके लिए कोई इमेज बनाई ही नहीं जाती, और न ही Pi Zero जैसे 512 MB-श्रेणी के बोर्डों पर, जो मेमोरी की न्यूनतम सीमा से नीचे हैं (नीचे देखें)।

### Minimum (इमेज, फ़ाइलें, और हल्के PDF टूल; कोई AI नहीं) {#minimum-image-files-and-light-pdf-tools-no-ai}

| रिसोर्स | आवश्यकता |
|---|---|
| CPU | 2 कोर |
| RAM | 2 GB |
| डिस्क | ~5.5 GB (इमेज) + डेटा वॉल्यूम |
| GPU | आवश्यक नहीं |

सभी 222 गैर-AI कैटलॉग टूल - इमेज (रिसाइज़, क्रॉप, कन्वर्ट, कंप्रेस, एडजस्ट, वॉटरमार्क), वीडियो (ट्रिम, म्यूट, रीमक्स), ऑडियो (कन्वर्ट, नॉर्मलाइज़, ट्रिम), PDF (मर्ज, स्प्लिट, कंप्रेस, रोटेट, प्रोटेक्ट), फ़ाइल रूपांतरण, और समर्पित रूपांतरण प्रीसेट - मामूली हार्डवेयर पर चलते हैं। अधिकांश ऑपरेशन एक बड़ी फ़ाइल पर भी एक सेकंड से काफ़ी कम समय में पूरे हो जाते हैं: एक 2.7 MB इमेज ~0.05 s में रिसाइज़ होती है और ~2 s में WebP में री-एनकोड होती है।

मेमोरी की न्यूनतम सीमा असली है, यह एक Docker रिसोर्स-लिमिट स्वीप से आती है: **512 MB स्टैक शुरू नहीं कर सकता** (एक अकेली इमेज रिसाइज़ भी मार दी जाती है), **1 GB** एकल-फ़ाइल ऑपरेशन संभालता है पर मल्टी-फ़ाइल बैच में मेमोरी खत्म हो जाती है, और **2 GB / 2 कोर** सबसे छोटा कॉन्फ़िगरेशन है जो बैच को आराम से संभालता है।

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**एकमात्र CPU-भारी अपवाद वीडियो री-एनकोडिंग है।** स्ट्रीम-कॉपी ऑपरेशन (ट्रिम, म्यूट, कंटेनर रीमक्स) तत्काल होते हैं, पर किसी अलग कोडेक में ट्रांसकोडिंग CPU-बद्ध है। एक 1080p / 45-सेकंड क्लिप को VP9 (WebM) में री-एनकोड करने में एक तेज़ आधुनिक CPU पर लगभग **~40 s**, Apple Silicon पर ~45 s, एक पुराने मोबाइल 4-कोर पर ~80 s, और एक पुराने 4-कोर सर्वर पर **~130 s** लगते हैं। यदि आपका वर्कलोड वीडियो-भारी है, तो CPU कोर और क्लॉक स्पीड को प्राथमिकता दें, या कंटेनर की `cpus:` लिमिट बढ़ाएँ, शिप किया गया compose ऐप को डिफ़ॉल्ट रूप से 4 कोर पर सीमित करता है (GPU compose पर 8)।

### Recommended (CPU पर AI टूल) {#recommended-ai-tools-on-cpu}

| रिसोर्स | आवश्यकता |
|---|---|
| CPU | 4 कोर |
| RAM | 4 GB |
| Disk | 3 जीबी (छवि) + लगभग 20 जीबी (सभी वैकल्पिक एआई पैक) + कार्यक्षेत्र |
| GPU | आवश्यक नहीं (CPU फ़ॉलबैक) |

**बड़े AI बंडलों को इंस्टॉल करना और चलाना अनुशंसा को 4 जीबी RAM तक बढ़ा देता है।** कोई वैकल्पिक पैक इंस्टॉल नहीं होने से ऐप लगभग 360 एमबी निष्क्रिय रहता है। लीगेसी Python उपकरण एक sidecar साझा करते हैं, जबकि सटीक OCR सक्रिय अपरिवर्तनीय पीढ़ी पर पिन किए गए एक समर्पित लंबे समय तक चलने वाले dispatcher का उपयोग करता है। सक्रियण से पहले, इंस्टॉलर उम्मीदवार पर एक smoke test चलाता है। इसके बाद यह परमाणु रूप से नए dispatcher पर स्विच हो जाता है और garbage collection से पहले पिछले dispatcher को हटा देता है। प्रत्येक आधिकारिक सटीक-ओसीआर आर्टिफैक्ट को 4 GiB cgroup के अंदर अपनी सबसे खराब स्थिति release suite से गुजरना होगा, जबकि 4 जीबी होस्ट अनुशंसा Node.js एप्लिकेशन, Postgres, Redis, कतारों और समवर्ती कार्य के लिए हेडरूम छोड़ती है।

अधिकांश AI टूल CPU पर पूरी तरह उपयोगी हैं; कुछ को वास्तव में GPU चाहिए। एक आधुनिक 4-कोर CPU पर मापा गया:

| AI टूल | CPU समय | CPU पर उपयोगी? |
|---|---|---|
| फ़ेस डिटेक्शन (blur-faces, smart-crop, red-eye), noise-removal | 1 s से कम | हाँ |
| OCR, ट्रांसक्रिप्शन, सबटाइटल | 1-3 s | हाँ |
| Colorize, फ़ेस एन्हांसमेंट | ~10 s | हाँ |
| बैकग्राउंड हटाना / बदलना / ब्लर | ~29 s | हाँ (आपको इंतज़ार करना होगा) |
| AI अपस्केल (RealESRGAN) | ~33 s छोटी; बड़ी इमेजों पर मिनट | सीमांत, GPU दृढ़ता से अनुशंसित |
| फ़ोटो रीस्टोरेशन (पूरी पाइपलाइन) | कई मिनट | नहीं, GPU या एक तेज़ मल्टी-कोर CPU चाहिए |

SnapOtter जानबूझकर इन मॉडल डाउनलोड को Docker इमेज में नहीं बेक करता। AI बंडल केवल तभी खींचे जाते हैं जब कोई व्यवस्थापक संबंधित टूल सक्षम करता है, इन्हें स्थायी `/data/ai` वॉल्यूम में संग्रहीत किया जाता है, और उसी मॉडल स्टैक पर निर्भर हर टूल द्वारा साझा किया जाता है। इससे अंतिम कंटेनर इमेज छोटी रहती है, जबकि एक पूर्ण AI इंस्टॉलेशन नीचे दी गई बड़ी स्टोरेज संख्याओं तक पहुँच सकता है।

कुछ टूल एक से अधिक साझा बंडल पर निर्भर होते हैं। उदाहरण के लिए, Passport Photo को `background-removal` और `face-detection` दोनों चाहिए; यदि `background-removal` पहले से इंस्टॉल है, तो Passport Photo सक्षम करने पर केवल गायब `face-detection` बंडल डाउनलोड होता है। यही पुनः उपयोग सभी AI टूलों पर लागू होता है।

वैकल्पिक एआई पैक भंडारण अनुमान:

| बंडल | डिस्क आकार |
|---|---|
| बैकग्राउंड हटाना | 4-5 GB |
| अपस्केल + फ़ेस एन्हांस + नॉइज़ हटाना | 5-6 GB |
| फ़ेस डिटेक्शन | 200-300 MB |
| ऑब्जेक्ट इरेज़र + Colorize | 1-2 GB |
| सटीक OCR (`balanced`/`best`) | ~208-234 MiB डाउनलोड / ~409-488 MiB स्थापित |
| फ़ोटो रीस्टोरेशन | 4-5 GB |
| प्रतिलिपि | ~600 एमबी |
| **सभी बंडल** | **~20 जीबी स्थापित** |

तेज़ OCR को Tesseract के माध्यम से छवि में बनाया गया है, लगभग 25 MiB जोड़ता है, और वैकल्पिक OCR पैक या इसकी 4 GiB मेमोरी आवश्यकता की आवश्यकता नहीं है। सटीक पैक आधिकारिक Linux amd64 और arm64 कंटेनर में उपलब्ध है और CPU पर ONNX Runtime चलाता है। NVIDIA होस्ट उसी CPU OCR रनटाइम का उपयोग करते हैं, इसलिए OCR CUDA संस्करण या GPU आर्किटेक्चर पर निर्भर नहीं होता है। सटीक रनटाइम के लिए कम से कम 4 GiB प्रभावी मेमोरी की आवश्यकता होती है: कॉन्फ़िगर कंटेनर cgroup सीमा, अन्यथा होस्ट मेमोरी। SnapOtter पैक डाउनलोड करने से पहले हस्ताक्षरित न्यूनतम संगतता से नीचे के सिस्टम को अस्वीकार कर देता है। सटीक-पैक इंस्टॉलेशन को bare-metal/प्रीबिल्ट आर्काइव्स पर भी अस्वीकार कर दिया गया है, जिनके libc और Python ABI की गारंटी नहीं दी जा सकती है।

एक ही `DATA_DIR` साझा करने वाली रेप्लिकाओं को समान CPU आर्किटेक्चर का उपयोग करना चाहिए; नोड अफ़िनिटी की मदद से मल्टी-रेप्लिका डिप्लॉयमेंट को संगत नोड पर पिन करें। मिश्रित amd64/arm64 रेप्लिकाओं के लिए अलग-अलग डेटा वॉल्यूम और स्वतंत्र SnapOtter डिप्लॉयमेंट आवश्यक हैं।

सटीक रनटाइम एक सक्रिय पीढ़ी को बनाए रखता है और सक्रियण के बाद इसके डाउनलोड कैश को शुद्ध करता है। इस रिलीज़ के लिए, पहली स्थापना के लिए संग्रह प्लस स्टेजिंग के लिए अस्थायी रूप से लगभग 620-720 MiB की आवश्यकता होती है, और पुरानी पीढ़ी के सक्रिय रहने पर अपग्रेड 1.2 GiB के करीब पहुंच सकता है। इंस्टॉलर डाउनलोड करने या निकालने से पहले हस्ताक्षरित इंडेक्स और वर्तमान पीढ़ियों से सटीक आवश्यकता की गणना करता है, और यदि डेटा वॉल्यूम बहुत छोटा है तो जल्दी विफल हो जाता है।

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Full (NVIDIA CUDA पर AI टूल) {#full-ai-tools-on-nvidia-cuda}

| रिसोर्स | आवश्यकता |
|---|---|
| CPU | 6-8 कोर (GPU AI के साथ भी वीडियो तैयारी + समवर्तीता CPU पर चलती है) |
| RAM | 8 GB |
| GPU | 8+ GB VRAM वाला NVIDIA (12 GB अनुशंसित) |
| डिस्क | कुल ~35 GB |

एक NVIDIA GPU (CUDA) भारी AI मॉडलों को नाटकीय रूप से तेज़ कर देता है। एक RTX 4070 बनाम एक आधुनिक CPU पर मापा गया:

| AI टूल | GPU के साथ तेज़ी | टिप्पणियाँ |
|---|---|---|
| AI अपस्केल (RealESRGAN 2×) | **~47×** | सबसे बड़ा फ़ायदा, एक सेकंड से कम बनाम ~33 s (बड़ी इमेजों पर मिनट) |
| फ़ेस एन्हांसमेंट (CodeFormer) | **~12×** | ~0.9 s बनाम ~11 s |
| ट्रांसक्रिप्शन (Whisper) | ~4.5× | |
| बैकग्राउंड हटाना / बदलना / ब्लर | ~4× | GPU पर ~7 s बनाम CPU पर ~29 s |
| Colorize | ~1.8× | |
| OCR, फ़ेस डिटेक्शन, red-eye, noise-removal | ~1× | CPU पर पहले से तेज़, GPU मदद नहीं करता |
| फ़ोटो रीस्टोरेशन | कोई नहीं | GPU पर भी CPU-बद्ध (0% GPU उपयोग); यहाँ GPU से ज़्यादा एक तेज़ CPU मायने रखता है |

GPU के लायक टूल हैं **अपस्केल, फ़ेस एन्हांसमेंट, ट्रांसक्रिप्शन, और बैकग्राउंड हटाना**। फ़ेस डिटेक्शन, OCR, और red-eye CPU-बद्ध हैं और पहले से तेज़ हैं, इसलिए GPU कुछ नहीं जोड़ता।

फ़ेस एन्हांसमेंट के साथ अपस्केल के दौरान चरम VRAM उपयोग 7.5 GB तक पहुँचता है। एक 6 GB NVIDIA GPU अधिकांश AI टूलों के लिए अलग-अलग काम करता है पर अपस्केल पर विफल होगा। 8-12 GB VRAM सब कुछ संभालता है।

VA-API, Quick Sync, या OpenCL के माध्यम से Intel/AMD iGPU त्वरण आज AI इन्फ़रेंस के लिए सपोर्ट नहीं किया जाता। कंटेनर में `/dev/dri` को मैप करने से AI GPU त्वरण सक्षम नहीं होता; NVIDIA CUDA उपलब्ध न होने पर SnapOtter AI टूलों को CPU पर चलाएगा।

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

### Concurrent Users {#concurrent-users}

डिफ़ॉल्ट 4-कोर-सीमित ऐप कंटेनर के विरुद्ध समानांतर इमेज-रिसाइज़ अनुरोध:

| समवर्ती अनुरोध | औसत प्रतिक्रिया समय | त्रुटियाँ |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

जैसे-जैसे वर्कर पूल संतृप्त होता है, प्रतिक्रिया समय बिना किसी त्रुटि के उप-रैखिक रूप से घटता है। ऐप कंटेनर की `cpus:` लिमिट बढ़ाने से (या अधिक कोर वाले होस्ट का उपयोग करने से) यह सीमा ऊपर उठती है। ध्यान दें कि भारी जॉब (वीडियो ट्रांसकोड, CPU AI) अपनी पूरी अवधि के लिए एक वर्कर को पकड़े रखते हैं, इसलिए CPU का आकार अपने अपेक्षित समवर्ती भारी जॉब की संख्या के अनुसार तय करें, केवल अनुरोध संख्या के अनुसार नहीं।

### Supported Image Formats {#supported-image-formats}

SnapOtter **55+ इनपुट फ़ॉर्मैट** और **14 आउटपुट फ़ॉर्मैट** को सपोर्ट करता है, जिनमें 20+ कैमरा ब्रांडों की RAW फ़ाइलें, पेशेवर फ़ॉर्मैट (PSD, EPS, OpenEXR, HDR), आधुनिक कोडेक (JPEG XL, AVIF, HEIC, QOI), और वैज्ञानिक/गेमिंग फ़ॉर्मैट (FITS, DDS) शामिल हैं।

हर सपोर्टेड फ़ॉर्मैट, उपयोग किए गए डिकोडर, और उपलब्ध क्वालिटी नियंत्रणों के विवरण के लिए [पूर्ण फ़ॉर्मैट सूची](/hi/guide/supported-formats) देखें।

### Known Limitations {#known-limitations}

- **Content-aware resize** caire बाइनरी की एक सीमा के कारण बड़ी इमेजों (>5 MP) पर क्रैश हो जाता है। छोटी इमेजों के साथ ठीक काम करता है।
- **HEIF डिकोड** में 13-23 सेकंड लगते हैं। HEIC (Apple का वेरिएंट) 0.3-0.9 सेकंड पर बहुत तेज़ है।
- **Upscale** छोटी इमेजों से परे किसी भी चीज़ के लिए CPU पर टाइम आउट हो जाता है। व्यावहारिक उपयोग के लिए GPU आवश्यक है।
- **CodeFormer** फ़ेस एन्हांसमेंट GFPGAN से काफ़ी धीमा है (GPU पर 53s बनाम 2s)। अधिकांश उपयोग परिदृश्यों के लिए GFPGAN अनुशंसित है।

## Volumes {#volumes}

| माउंट / वॉल्यूम | उद्देश्य | आवश्यक? |
|---|---|---|
| `/data` (ऐप) | AI मॉडल, Python venv, उपयोगकर्ता फ़ाइलें | **हाँ**, इसके बिना फ़ाइल हानि |
| `/tmp/workspace` (ऐप) | अस्थायी प्रोसेसिंग फ़ाइलें (स्वतः-साफ़) | अनुशंसित |
| `SnapOtter-pgdata` (postgres) | PostgreSQL डेटा डायरेक्टरी (उपयोगकर्ता, सेटिंग्स, पाइपलाइन, जॉब) | **हाँ**, इसके बिना डेटा हानि |
| `SnapOtter-redisdata` (redis) | टिकाऊ जॉब क्यू के लिए Redis append-only फ़ाइल | अनुशंसित |

### Bind mounts vs. named volumes {#bind-mounts-vs-named-volumes}

**नामित वॉल्यूम** (अनुशंसित), Docker स्वचालित रूप से अनुमतियाँ प्रबंधित करता है:
```yaml
volumes:
  - SnapOtter-data:/data
```

**बाइंड माउंट**, आप अनुमतियाँ प्रबंधित करते हैं। अपने होस्ट उपयोगकर्ता से मिलाने के लिए `PUID`/`PGID` सेट करें:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Storage permissions {#storage-permissions}

SnapOtter रनटाइम पर दो स्थानों पर लिखता है: `/data` (उपयोगकर्ता फ़ाइलें, लॉग, AI मॉडल और Python venv) और `/tmp/workspace` (अस्थायी प्रोसेसिंग स्क्रैच)। दोनों उस उपयोगकर्ता द्वारा लिखने योग्य होने चाहिए जिसके रूप में कंटेनर चलता है। यदि कोई एक नहीं है, तो कंटेनर स्टार्टअप पर **तुरंत विफल हो जाता है**, एक संदेश के साथ जो डायरेक्टरी, चल रहे UID/GID, और इसे कैसे ठीक करें बताता है, बजाय "healthy" के रूप में बूट होकर फिर पहले अपलोड पर एक रहस्यमय त्रुटि के साथ विफल होने के।

अनुमतियाँ कैसे संभाली जाती हैं यह इस पर निर्भर करता है कि कंटेनर कैसे लॉन्च किया गया है:

**डिफ़ॉल्ट (root के रूप में शुरू, `snapotter` पर गिरता है)**, एंट्रीपॉइंट root के रूप में शुरू होता है, माउंट किए गए वॉल्यूम के स्वामित्व को ठीक करता है, फिर `gosu` के माध्यम से अनप्रिविलेज्ड `snapotter` उपयोगकर्ता पर गिर जाता है। नामित वॉल्यूम बिना किसी कॉन्फ़िगरेशन के काम करते हैं। बाइंड माउंट के लिए, `PUID`/`PGID` को अपने होस्ट उपयोगकर्ता (ऊपर) पर सेट करें ताकि यह जो फ़ाइलें लिखे उनका स्वामित्व आपका हो।

**Kubernetes / OpenShift (`runAsUser` के माध्यम से गैर-root)**, सीधे एक गैर-root उपयोगकर्ता के रूप में लॉन्च होने पर, कंटेनर स्वयं वॉल्यूम को chown नहीं कर सकता, इसलिए ऑर्केस्ट्रेटर को उन्हें लिखने योग्य बनाना होगा। `fsGroup` सेट करें:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

इमेज की लिखने योग्य डायरेक्टरियाँ GID 0 द्वारा समूह-स्वामित्व वाली और समूह-लिखने योग्य हैं, इसलिए एक **मनमाने UID** प्लस root अनुपूरक समूह (OpenShift डिफ़ॉल्ट) के साथ चलने वाला पॉड बिना किसी `chown` के लिख सकता है।

**TrueNAS Scale (और अन्य "विदेशी UID" सेटअप)**, TrueNAS ऐप्स को एक गैर-root उपयोगकर्ता (अक्सर `568:568`) के रूप में चलाता है और एक अलग उपयोगकर्ता के स्वामित्व वाले होस्ट डेटासेट माउंट करता है, इसलिए न तो एंट्रीपॉइंट और न ही `fsGroup` उन्हें स्वयं लिखने योग्य बनाता है। एक चुनें:

- **ऐप को root के रूप में चलाएँ** (अनुशंसित), ऐप के उपयोगकर्ता को अनसेट छोड़ दें या इसे `0` पर सेट करें, और डिफ़ॉल्ट एंट्रीपॉइंट को अनुमतियाँ ठीक करने और `snapotter` पर गिरने दें।
- **UID `999` के रूप में चलाएँ**, ऐप के उपयोगकर्ता/समूह को `999:999` (SnapOtter का बिल्ट-इन `snapotter` उपयोगकर्ता) पर सेट करें ताकि यह इमेज के स्वामित्व से मेल खाए।
- होस्ट डेटासेट को उस UID पर **`chown`** करें जिसके रूप में कंटेनर चलता है, TrueNAS शेल से:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

स्टार्टअप त्रुटि उपयोग करने के लिए सटीक UID बताती है, इसलिए सबसे तेज़ रास्ता है ऐप को एक बार शुरू करना, संदेश पढ़ना, फिर तदनुसार `chown` करना (या उपयोगकर्ता समायोजित करना)।

## Environment Variables {#environment-variables}

| वेरिएबल | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `AUTH_ENABLED` | `true` | लॉगिन आवश्यकता सक्षम/अक्षम करें |
| `DEFAULT_USERNAME` | `admin` | प्रारंभिक व्यवस्थापक उपयोगकर्ता नाम |
| `DEFAULT_PASSWORD` | `admin` | प्रारंभिक व्यवस्थापक पासवर्ड (पहले लॉगिन पर बदलना अनिवार्य) |
| `MAX_UPLOAD_SIZE_MB` | `100` | प्रति-फ़ाइल अपलोड सीमा |
| `MAX_BATCH_SIZE` | `100` | प्रति बैच अनुरोध अधिकतम फ़ाइलें |
| `RATE_LIMIT_PER_MIN` | `1000` | प्रति IP प्रति मिनट API अनुरोध (अक्षम करने के लिए 0 सेट करें) |
| `MAX_USERS` | `0` (असीमित) | अधिकतम उपयोगकर्ता खाते |
| `TRUST_PROXY` | `true` | रिवर्स प्रॉक्सी से X-Forwarded-For हेडर पर भरोसा करें |
| `PUID` | `999` | इस UID के रूप में चलाएँ (बाइंड माउंट अनुमतियों के लिए) |
| `PGID` | `999` | इस GID के रूप में चलाएँ (बाइंड माउंट अनुमतियों के लिए) |
| `LOG_LEVEL` | `info` | लॉग वर्बोसिटी: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | अधिकतम समानांतर AI प्रोसेसिंग जॉब |
| `SESSION_DURATION_HOURS` | `168` | लॉगिन सत्र जीवनकाल (7 दिन) |
| `CORS_ORIGIN` | (खाली) | अल्पविराम-पृथक अनुमत ऑरिजिन, या समान-ऑरिजिन के लिए खाली |

### आउटबाउंड प्रॉक्सी और निजी CA {#outbound-proxy-and-private-ca}

आधिकारिक कंटेनर नोड के पर्यावरण-प्रॉक्सी समर्थन को सक्षम करता है। यदि SnapOtter को कॉर्पोरेट प्रॉक्सी के माध्यम से OCR रनटाइम रिपॉजिटरी या अन्य HTTPS सेवाओं तक पहुंचना है, तो `HTTPS_PROXY` (और जरूरत पड़ने पर `HTTP_PROXY`) सेट करें। `NO_PROXY` को उन होस्ट की अल्पविराम से अलग की गई सूची में सेट करें जिन तक सीधे पहुंचना चाहिए, जैसे Postgres, Redis और आंतरिक ऑब्जेक्ट स्टोरेज।

यदि प्रॉक्सी या आंतरिक सेवा एक निजी प्रमाणपत्र प्राधिकारी द्वारा हस्ताक्षरित है, तो CA प्रमाणपत्र को केवल पढ़ने के लिए माउंट करें और उस पर `NODE_EXTRA_CA_CERTS` इंगित करें। नोड प्रक्रिया शुरू होने पर फ़ाइल मौजूद होनी चाहिए:

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

प्रॉक्सी क्रेडेंशियल को Compose फ़ाइल के बाहर रखें (उदाहरण के लिए संरक्षित `.env` फ़ाइल या गुप्त में)। टीएलएस सत्यापन को अक्षम न करें: हस्ताक्षरित OCR सूचकांक रिलीज मेटाडेटा को प्रमाणित करता है, जबकि सामान्य टीएलएस सत्यापन अभी भी परिवहन और हर अन्य आउटबाउंड अनुरोध की सुरक्षा करता है।

## Health Check {#health-check}

कंटेनर में एक बिल्ट-इन हेल्थ चेक शामिल है:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse Proxy {#reverse-proxy}

SnapOtter डिफ़ॉल्ट रूप से `TRUST_PROXY=true` सेट करता है ताकि रेट लिमिटिंग और लॉगिंग `X-Forwarded-For` हेडर से असली क्लाइंट IP का उपयोग करें।

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

1. एक नया Proxy Host जोड़ें
2. Domain Name को अपने डोमेन पर सेट करें
3. Scheme को `http` पर, Forward Hostname को `SnapOtter` (या अपने कंटेनर IP) पर, Forward Port को `1349` पर सेट करें
4. WebSocket सपोर्ट सक्षम करें
5. Advanced के अंतर्गत, जोड़ें: `client_max_body_size 500M;` और `proxy_buffering off;`

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

`flush_interval -1` रिस्पॉन्स बफ़रिंग को अक्षम करता है, जो SSE प्रगति इवेंट (बैच प्रोसेसिंग, AI टूल, फ़ीचर इंस्टॉल) के लिए आवश्यक है। विस्तारित टाइमआउट बड़ी फ़ाइल अपलोड को Caddy द्वारा कनेक्शन जल्दी बंद किए बिना पूरा होने देते हैं।

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

नोट: Cloudflare की फ़्री योजनाओं पर 100 MB अपलोड सीमा है। मिलाने के लिए `MAX_UPLOAD_SIZE_MB=100` सेट करें।

## CI/CD {#ci-cd}

GitHub रिपॉज़िटरी में तीन वर्कफ़्लो हैं:

- **ci.yml** - हर push और PR पर स्वचालित रूप से चलता है। लिंट, टाइपचेक, टेस्ट, बिल्ड करता है, और Docker इमेज को वैलिडेट करता है (बिना push किए)।
- **release.yml** - `workflow_dispatch` के माध्यम से मैन्युअल रूप से ट्रिगर होता है। एक वर्शन टैग और GitHub रिलीज़ बनाने के लिए semantic-release चलाता है, फिर एक मल्टी-आर्च Docker इमेज (amd64 + arm64) बनाता है और Docker Hub (`snapotter/snapotter`) तथा GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`) पर push करता है।
- **deploy-docs.yml** - `main` पर push होने पर इस दस्तावेज़ीकरण साइट को बनाता है और Cloudflare Pages पर डिप्लॉय करता है।

एक रिलीज़ बनाने के लिए, GitHub UI में **Actions > Release > Run workflow** पर जाएँ, या चलाएँ:

```bash
gh workflow run release.yml
```

Semantic-release कमिट इतिहास से वर्शन निर्धारित करता है। `latest` Docker टैग हमेशा सबसे हाल की रिलीज़ की ओर इंगित करता है।

## Analytics {#analytics}

SnapOtter में बग पकड़ने और फ़ीचर सुधारने में मदद के लिए अनाम उत्पाद एनालिटिक्स (टूल उपयोग पैटर्न, त्रुटि रिपोर्ट) शामिल है। यह डिफ़ॉल्ट रूप से चालू है। आपकी फ़ाइलें, फ़ाइल नाम, और व्यक्तिगत डेटा कभी इसका हिस्सा नहीं होते। SnapOtter एनालिटिक्स अक्षम होने पर भी सामान्य रूप से काम करता है।

### Disabling analytics {#disabling-analytics}

रनटाइम ऑप्ट-आउट एक-क्लिक व्यवस्थापक टॉगल है। Settings > System > Privacy खोलें और Anonymous Product Analytics बंद कर दें। यह पूरे इंस्टेंस के लिए तुरंत रुक जाता है, किसी रीबिल्ड की आवश्यकता नहीं।

एक ऐसी इमेज के लिए जो कभी एनालिटिक्स उत्सर्जित नहीं कर सकती, रिपॉज़िटरी क्लोन करके और रीबिल्ड करके बिल्ड-टाइम हार्ड-ऑफ़ सेट करें:

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
