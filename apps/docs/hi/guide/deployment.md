---
description: "Docker के साथ SnapOtter को प्रोडक्शन में तैनात करें। हार्डवेयर आवश्यकताएँ, GPU सेटअप, और Nginx, Traefik, तथा Cloudflare के लिए रिवर्स प्रॉक्सी कॉन्फ़िग।"
i18n_source_hash: ecc1b528bc4b
i18n_provenance: human
i18n_output_hash: d734bb37738a
---

# तैनाती {#deployment}

SnapOtter एक 3-कंटेनर Docker Compose स्टैक के रूप में तैनात होता है: SnapOtter ऐप इमेज, PostgreSQL 17, और Redis 8. ऐप इमेज **linux/amd64** (AI त्वरण के लिए NVIDIA CUDA के साथ) और **linux/arm64** (CPU) का समर्थन करती है, इसलिए यह Intel/AMD सर्वर, Apple Silicon Mac, और Raspberry Pi 4/5 जैसे ARM डिवाइस पर मूल रूप से चलती है। VA-API, Quick Sync, या OpenCL के माध्यम से Intel/AMD iGPU त्वरण आज AI इन्फ़रेंस के लिए समर्थित नहीं है।

GPU सेटअप, Docker Compose उदाहरण, और संस्करण पिनिंग के लिए [Docker Image](./docker-tags) देखें।

## त्वरित प्रारंभ (CPU) {#quick-start-cpu}

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

फिर ऐप `http://localhost:1349` पर उपलब्ध होता है।

> **Docker Hub दर सीमा?** GitHub Container Registry से पुल करने के लिए `snapotter/snapotter:latest` को `ghcr.io/snapotter-hq/snapotter:latest` से बदलें। दोनों रजिस्ट्री को प्रत्येक रिलीज़ पर वही इमेज मिलती है।

## त्वरित प्रारंभ (NVIDIA CUDA) {#quick-start-nvidia-cuda}

AI टूल (बैकग्राउंड हटाना, अपस्केलिंग, फ़ेस एन्हांसमेंट, OCR) पर NVIDIA CUDA त्वरण के लिए:

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

लॉग में CUDA का पता लगने की जाँच करें:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## हार्डवेयर आवश्यकताएँ {#hardware-requirements}

ये संख्याएँ विभिन्न प्रकार की प्रणालियों में किए गए बेंचमार्क से आती हैं, एक NVIDIA RTX 4070 वाले आधुनिक amd64 वर्कस्टेशन से लेकर एक Raspberry Pi तक, प्रत्येक पर पूरे टूल कैटलॉग को चलाकर और वास्तविक न्यूनतम सीमा खोजने के लिए Docker संसाधन सीमाओं को स्वीप करके।

### त्वरित संदर्भ {#quick-reference}

| स्तर | उपयोग केस | CPU | RAM | GPU | स्टोरेज |
|------|----------|-----|-----|-----|---------|
| न्यूनतम | छवि, फ़ाइलें, और हल्के PDF टूल; एकल उपयोगकर्ता; छोटे बैच | 2 कोर | 2 GB | कोई नहीं | ~7 GB |
| अनुशंसित | सभी पाँच मोडैलिटी सहित वीडियो, PDF, और CPU पर AI; बैच; कुछ उपयोगकर्ता | 4 कोर | 4 GB | कोई नहीं | ~25 GB |
| पूर्ण | सब कुछ गति के साथ सहित GPU AI; बड़े बैच; कई उपयोगकर्ता | 6-8 कोर | 8 GB | NVIDIA 8 GB+ VRAM (12 GB आरामदायक) | ~35 GB |

**आर्किटेक्चर: केवल 64-बिट** (`linux/amd64` या `linux/arm64`)। SnapOtter Intel/AMD सर्वर, Apple Silicon Mac, और **Raspberry Pi 4 और 5** (4-8 GB) सहित 64-बिट ARM बोर्ड पर मूल रूप से चलता है। यह 32-बिट ARM (`armv7`/`armhf`) पर **नहीं** चलता — इसके लिए कोई इमेज नहीं बनाई जाती — और न ही Pi Zero जैसे 512 MB-श्रेणी के बोर्ड पर, जो मेमोरी न्यूनतम सीमा से नीचे हैं (नीचे देखें)।

### न्यूनतम (छवि, फ़ाइलें, और हल्के PDF टूल; कोई AI नहीं) {#minimum-image-files-and-light-pdf-tools-no-ai}

| संसाधन | आवश्यकता |
|---|---|
| CPU | 2 कोर |
| RAM | 2 GB |
| डिस्क | ~5.5 GB (इमेज) + डेटा वॉल्यूम |
| GPU | आवश्यक नहीं |

सभी 222 गैर-AI कैटलॉग टूल - छवि (रीसाइज़, क्रॉप, कन्वर्ट, कंप्रेस, एडजस्ट, वॉटरमार्क), वीडियो (ट्रिम, म्यूट, रीमक्स), ऑडियो (कन्वर्ट, नॉर्मलाइज़, ट्रिम), PDF (मर्ज, स्प्लिट, कंप्रेस, रोटेट, प्रोटेक्ट), फ़ाइल कन्वर्ज़न, और समर्पित कन्वर्ज़न प्रीसेट - मामूली हार्डवेयर पर चलते हैं। अधिकांश ऑपरेशन एक बड़ी फ़ाइल पर भी एक सेकंड से काफ़ी कम में पूरे हो जाते हैं: एक 2.7 MB की छवि ~0.05 s में रीसाइज़ होती है और ~2 s में WebP में री-एनकोड होती है।

मेमोरी न्यूनतम सीमा वास्तविक है, एक Docker संसाधन-सीमा स्वीप से: **512 MB स्टैक को शुरू नहीं कर सकता** (यहाँ तक कि एक अकेली छवि रीसाइज़ भी बंद कर दी जाती है), **1 GB** एकल-फ़ाइल ऑपरेशन संभालता है लेकिन एक बहु-फ़ाइल बैच में मेमोरी समाप्त हो जाती है, और **2 GB / 2 कोर** सबसे छोटा कॉन्फ़िगरेशन है जो बैच को आराम से संभालता है।

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**एकमात्र CPU-भारी अपवाद वीडियो री-एनकोडिंग है।** स्ट्रीम-कॉपी ऑपरेशन (ट्रिम, म्यूट, कंटेनर रीमक्स) तुरंत होते हैं, लेकिन एक अलग कोडेक में ट्रांसकोडिंग CPU-बाध्य है। एक 1080p / 45-सेकंड क्लिप को VP9 (WebM) में री-एनकोड करने में एक तेज़ आधुनिक CPU पर लगभग **~40 s**, Apple Silicon पर ~45 s, एक पुराने मोबाइल 4-कोर पर ~80 s, और एक पुराने 4-कोर सर्वर पर **~130 s** लगते हैं। यदि आपका कार्यभार वीडियो-भारी है, तो CPU कोर और क्लॉक गति को प्राथमिकता दें, या कंटेनर की `cpus:` सीमा बढ़ाएँ — शिप किया गया compose डिफ़ॉल्ट रूप से ऐप को 4 कोर पर सीमित करता है (GPU compose पर 8)।

### अनुशंसित (CPU पर AI टूल) {#recommended-ai-tools-on-cpu}

| संसाधन | आवश्यकता |
|---|---|
| CPU | 4 कोर |
| RAM | 4 GB |
| डिस्क | 3 GB (इमेज) + 24 GB (AI मॉडल) + वर्कस्पेस |
| GPU | आवश्यक नहीं (CPU फ़ॉलबैक) |

**AI बंडल इंस्टॉल करना ही RAM को 4 GB तक धकेलता है।** बिना किसी AI इंस्टॉल के ऐप लगभग 360 MB पर निष्क्रिय रहता है; सभी सात बंडल इंस्टॉल होने पर यह ~2.6 GB रेज़िडेंट बनाए रखता है, क्योंकि Python AI साइडकार स्टार्टअप पर अपने मॉडल (बैकग्राउंड हटाना, अपस्केलिंग, OCR, ट्रांसक्रिप्शन, फ़ेस डिटेक्शन, रीस्टोरेशन) पहले से लोड करता है। गैर-AI इंस्टॉल हल्के रहते हैं; AI इंस्टॉल को ≥4 GB चाहिए।

अधिकांश AI टूल CPU पर पूरी तरह उपयोग योग्य हैं; कुछ को वास्तव में GPU चाहिए। एक आधुनिक 4-कोर CPU पर मापा गया:

| AI टूल | CPU समय | CPU पर उपयोग योग्य? |
|---|---|---|
| फ़ेस डिटेक्शन (blur-faces, smart-crop, red-eye), noise-removal | 1 s से कम | हाँ |
| OCR, ट्रांसक्रिप्शन, सबटाइटल | 1-3 s | हाँ |
| कलराइज़, फ़ेस एन्हांसमेंट | ~10 s | हाँ |
| बैकग्राउंड हटाना / बदलना / ब्लर | ~29 s | हाँ (आपको प्रतीक्षा करनी होगी) |
| AI अपस्केल (RealESRGAN) | ~33 s छोटे पर; बड़ी छवियों पर मिनट | सीमांत — GPU दृढ़ता से अनुशंसित |
| फ़ोटो रीस्टोरेशन (पूर्ण पाइपलाइन) | कई मिनट | नहीं — GPU या एक तेज़ मल्टी-कोर CPU चाहिए |

AI मॉडल डाउनलोड आकार:

| बंडल | डिस्क आकार |
|---|---|
| बैकग्राउंड हटाना | 4-5 GB |
| अपस्केल + फ़ेस एन्हांस + नॉइज़ हटाना | 5-6 GB |
| फ़ेस डिटेक्शन | 200-300 MB |
| ऑब्जेक्ट इरेज़र + कलराइज़ | 1-2 GB |
| OCR | 5-6 GB |
| फ़ोटो रीस्टोरेशन | 4-5 GB |
| **सभी बंडल** | **~24 GB** |

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
| CPU | 6-8 कोर (वीडियो तैयारी + समवर्तीता GPU AI के साथ भी CPU पर चलती है) |
| RAM | 8 GB |
| GPU | 8+ GB VRAM वाला NVIDIA (12 GB अनुशंसित) |
| डिस्क | ~35 GB कुल |

एक NVIDIA GPU (CUDA) भारी AI मॉडल को नाटकीय रूप से तेज़ करता है। एक RTX 4070 बनाम एक आधुनिक CPU पर मापा गया:

| AI टूल | GPU के साथ गति वृद्धि | नोट्स |
|---|---|---|
| AI अपस्केल (RealESRGAN 2×) | **~47×** | सबसे बड़ी जीत — एक सेकंड से कम बनाम ~33 s (बड़ी छवियों पर मिनट) |
| फ़ेस एन्हांसमेंट (CodeFormer) | **~12×** | ~0.9 s बनाम ~11 s |
| ट्रांसक्रिप्शन (Whisper) | ~4.5× | |
| बैकग्राउंड हटाना / बदलना / ब्लर | ~4× | GPU पर ~7 s बनाम CPU पर ~29 s |
| कलराइज़ | ~1.8× | |
| OCR, फ़ेस डिटेक्शन, red-eye, noise-removal | ~1× | CPU पर पहले से तेज़ — एक GPU मदद नहीं करता |
| फ़ोटो रीस्टोरेशन | कोई नहीं | GPU पर भी CPU-बाध्य (0% GPU उपयोग); यहाँ एक GPU से एक तेज़ CPU अधिक मायने रखता है |

GPU के लायक टूल हैं **अपस्केल, फ़ेस एन्हांसमेंट, ट्रांसक्रिप्शन, और बैकग्राउंड हटाना**। फ़ेस डिटेक्शन, OCR, और red-eye CPU-बाध्य हैं और पहले से तेज़ हैं, इसलिए एक GPU कुछ नहीं जोड़ता।

फ़ेस एन्हांसमेंट के साथ अपस्केल के दौरान पीक VRAM उपयोग 7.5 GB तक पहुँच जाता है। एक 6 GB NVIDIA GPU अधिकांश AI टूल के लिए व्यक्तिगत रूप से काम करता है लेकिन अपस्केल पर विफल हो जाएगा। 8-12 GB VRAM सब कुछ संभालता है।

VA-API, Quick Sync, या OpenCL के माध्यम से Intel/AMD iGPU त्वरण आज AI इन्फ़रेंस के लिए समर्थित नहीं है। `/dev/dri` को कंटेनर में मैप करने से AI GPU त्वरण सक्षम नहीं होता; जब तक NVIDIA CUDA उपलब्ध न हो, SnapOtter AI टूल CPU पर चलाएगा।

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

डिफ़ॉल्ट 4-कोर-सीमित ऐप कंटेनर के विरुद्ध समानांतर छवि-रीसाइज़ अनुरोध:

| समवर्ती अनुरोध | औसत प्रतिक्रिया समय | त्रुटियाँ |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

जैसे-जैसे वर्कर पूल संतृप्त होता है, प्रतिक्रिया समय बिना किसी त्रुटि के उप-रैखिक रूप से घटता है। ऐप कंटेनर की `cpus:` सीमा बढ़ाना (या अधिक कोर वाले होस्ट का उपयोग करना) सीमा को ऊपर उठाता है। ध्यान दें कि भारी जॉब (वीडियो ट्रांसकोड, CPU AI) अपनी पूरी अवधि के लिए एक वर्कर को पकड़े रखते हैं, इसलिए CPU को अपने अपेक्षित समवर्ती भारी जॉब की संख्या के अनुसार आकार दें, केवल अनुरोध संख्या के अनुसार नहीं।

### समर्थित छवि प्रारूप {#supported-image-formats}

SnapOtter **55+ इनपुट प्रारूपों** और **14 आउटपुट प्रारूपों** का समर्थन करता है, जिसमें 20+ कैमरा ब्रांडों की RAW फ़ाइलें, पेशेवर प्रारूप (PSD, EPS, OpenEXR, HDR), आधुनिक कोडेक (JPEG XL, AVIF, HEIC, QOI), और वैज्ञानिक/गेमिंग प्रारूप (FITS, DDS) शामिल हैं।

प्रत्येक समर्थित प्रारूप, उपयोग किए गए डिकोडर, और उपलब्ध गुणवत्ता नियंत्रणों के विवरण के लिए [पूर्ण प्रारूप सूची](/hi/guide/supported-formats) देखें।

### ज्ञात सीमाएँ {#known-limitations}

- **Content-aware resize** caire बाइनरी में एक सीमा के कारण बड़ी छवियों (>5 MP) पर क्रैश हो जाता है। छोटी छवियों के साथ ठीक काम करता है।
- **HEIF डिकोड** में 13-23 सेकंड लगते हैं। HEIC (Apple का प्रकार) 0.3-0.9 सेकंड पर बहुत तेज़ है।
- **OCR जापानी** एक PaddlePaddle MKLDNN बग के कारण CPU पर विफल हो जाता है। GPU पर काम करता है।
- **Upscale** छोटी छवियों से परे किसी भी चीज़ के लिए CPU पर टाइम आउट हो जाता है। व्यावहारिक उपयोग के लिए GPU आवश्यक है।
- **CodeFormer** फ़ेस एन्हांसमेंट GFPGAN की तुलना में काफ़ी धीमा है (GPU पर 53s बनाम 2s)। अधिकांश उपयोग मामलों के लिए GFPGAN अनुशंसित है।

## वॉल्यूम {#volumes}

| माउंट / वॉल्यूम | उद्देश्य | आवश्यक? |
|---|---|---|
| `/data` (ऐप) | AI मॉडल, Python venv, उपयोगकर्ता फ़ाइलें | **हाँ** - इसके बिना फ़ाइल हानि |
| `/tmp/workspace` (ऐप) | अस्थायी प्रोसेसिंग फ़ाइलें (स्वतः-साफ़) | अनुशंसित |
| `SnapOtter-pgdata` (postgres) | PostgreSQL डेटा डायरेक्टरी (उपयोगकर्ता, सेटिंग्स, पाइपलाइन, जॉब) | **हाँ** - इसके बिना डेटा हानि |
| `SnapOtter-redisdata` (redis) | टिकाऊ जॉब कतारों के लिए Redis append-only फ़ाइल | अनुशंसित |

### बाइंड माउंट बनाम नामित वॉल्यूम {#bind-mounts-vs-named-volumes}

**नामित वॉल्यूम** (अनुशंसित) — Docker अनुमतियों को स्वचालित रूप से प्रबंधित करता है:
```yaml
volumes:
  - SnapOtter-data:/data
```

**बाइंड माउंट** — आप अनुमतियाँ प्रबंधित करते हैं। अपने होस्ट उपयोगकर्ता से मिलान करने के लिए `PUID`/`PGID` सेट करें:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### स्टोरेज अनुमतियाँ {#storage-permissions}

SnapOtter रनटाइम पर दो स्थानों पर लिखता है: `/data` (उपयोगकर्ता फ़ाइलें, लॉग, AI मॉडल और Python venv) और `/tmp/workspace` (अस्थायी प्रोसेसिंग स्क्रैच)। दोनों उस उपयोगकर्ता द्वारा लिखने योग्य होने चाहिए जिस रूप में कंटेनर चलता है। यदि कोई भी नहीं है, तो कंटेनर **स्टार्टअप पर तुरंत विफल हो जाता है** एक संदेश के साथ जो डायरेक्टरी, चल रहे UID/GID, और इसे कैसे ठीक करें बताता है — बजाय "स्वस्थ" बूट होकर फिर पहले अपलोड पर एक रहस्यमय त्रुटि के साथ विफल होने के।

अनुमतियाँ कैसे संभाली जाती हैं यह इस पर निर्भर करता है कि कंटेनर कैसे लॉन्च किया गया है:

**डिफ़ॉल्ट (root के रूप में शुरू, `snapotter` पर गिरता है)** — एंट्रीपॉइंट root के रूप में शुरू होता है, माउंट किए गए वॉल्यूमों का स्वामित्व ठीक करता है, फिर `gosu` के माध्यम से अनविशेषाधिकृत `snapotter` उपयोगकर्ता पर गिरता है। नामित वॉल्यूम बिना किसी कॉन्फ़िगरेशन के काम करते हैं। बाइंड माउंट के लिए, `PUID`/`PGID` को अपने होस्ट उपयोगकर्ता (ऊपर) पर सेट करें ताकि यह जो फ़ाइलें लिखता है वे आपके स्वामित्व में हों।

**Kubernetes / OpenShift (`runAsUser` के माध्यम से गैर-root)** — सीधे एक गैर-root उपयोगकर्ता के रूप में लॉन्च किया गया, कंटेनर स्वयं वॉल्यूमों को chown नहीं कर सकता, इसलिए ऑर्केस्ट्रेटर को उन्हें लिखने योग्य बनाना होगा। `fsGroup` सेट करें:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

इमेज की लिखने योग्य डायरेक्टरियाँ GID 0 द्वारा समूह-स्वामित्व वाली और समूह-लिखने योग्य हैं, इसलिए एक **मनमाने UID** प्लस root अनुपूरक समूह (OpenShift डिफ़ॉल्ट) के साथ चलने वाला एक pod बिना किसी `chown` के लिख सकता है।

**TrueNAS Scale (और अन्य "विदेशी UID" सेटअप)** — TrueNAS ऐप्स को एक गैर-root उपयोगकर्ता के रूप में चलाता है (अक्सर `568:568`) और एक अलग उपयोगकर्ता के स्वामित्व वाले होस्ट डेटासेट माउंट करता है, इसलिए न तो एंट्रीपॉइंट और न ही `fsGroup` उन्हें स्वयं लिखने योग्य बनाता है। एक चुनें:

- **ऐप को root के रूप में चलाएँ** (अनुशंसित) — ऐप के उपयोगकर्ता को अनसेट छोड़ दें या इसे `0` पर सेट करें, और डिफ़ॉल्ट एंट्रीपॉइंट को अनुमतियाँ ठीक करने और `snapotter` पर गिरने दें।
- **UID `999` के रूप में चलाएँ** — ऐप के उपयोगकर्ता/समूह को `999:999` (SnapOtter के अंतर्निहित `snapotter` उपयोगकर्ता) पर सेट करें ताकि यह इमेज के स्वामित्व से मेल खाए।
- होस्ट डेटासेट को उस UID पर **`chown`** करें जिस रूप में कंटेनर चलता है, TrueNAS शेल से:

  ```bash
  # स्टार्टअप त्रुटि से UID का उपयोग करें (या कंटेनर के अंदर `id` चलाएँ)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

स्टार्टअप त्रुटि उपयोग करने के लिए सटीक UID बताती है, इसलिए सबसे तेज़ रास्ता ऐप को एक बार शुरू करना, संदेश पढ़ना, फिर तदनुसार `chown` (या उपयोगकर्ता समायोजित करना) है।

## एनवायरनमेंट वेरिएबल {#environment-variables}

| वेरिएबल | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `AUTH_ENABLED` | `true` | लॉगिन आवश्यकता सक्षम/अक्षम करें |
| `DEFAULT_USERNAME` | `admin` | प्रारंभिक एडमिन उपयोगकर्ता नाम |
| `DEFAULT_PASSWORD` | `admin` | प्रारंभिक एडमिन पासवर्ड (पहले लॉगिन पर अनिवार्य बदलाव) |
| `MAX_UPLOAD_SIZE_MB` | `100` | प्रति-फ़ाइल अपलोड सीमा |
| `MAX_BATCH_SIZE` | `100` | प्रति बैच अनुरोध अधिकतम फ़ाइलें |
| `RATE_LIMIT_PER_MIN` | `1000` | प्रति मिनट प्रति IP API अनुरोध (अक्षम करने के लिए 0 सेट करें) |
| `MAX_USERS` | `0` (असीमित) | अधिकतम उपयोगकर्ता खाते |
| `TRUST_PROXY` | `true` | रिवर्स प्रॉक्सी से X-Forwarded-For हेडर पर भरोसा करें |
| `PUID` | `999` | इस UID के रूप में चलाएँ (बाइंड माउंट अनुमतियों के लिए) |
| `PGID` | `999` | इस GID के रूप में चलाएँ (बाइंड माउंट अनुमतियों के लिए) |
| `LOG_LEVEL` | `info` | लॉग विस्तार: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (स्वतः) | अधिकतम समानांतर AI प्रोसेसिंग जॉब |
| `SESSION_DURATION_HOURS` | `168` | लॉगिन सत्र जीवनकाल (7 दिन) |
| `CORS_ORIGIN` | (खाली) | अल्पविराम-पृथक अनुमत मूल, या समान-मूल के लिए खाली |

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

SnapOtter डिफ़ॉल्ट रूप से `TRUST_PROXY=true` सेट करता है ताकि दर सीमा और लॉगिंग `X-Forwarded-For` हेडर से वास्तविक क्लाइंट IP का उपयोग करें।

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
3. Scheme को `http` पर, Forward Hostname को `SnapOtter` पर (या अपने कंटेनर IP पर), Forward Port को `1349` पर सेट करें
4. WebSocket समर्थन सक्षम करें
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

नोट: Cloudflare की मुफ़्त योजनाओं पर 100 MB अपलोड सीमा है। मिलान करने के लिए `MAX_UPLOAD_SIZE_MB=100` सेट करें।

## CI/CD {#ci-cd}

GitHub रिपॉज़िटरी में तीन वर्कफ़्लो हैं:

- **ci.yml** - हर push और PR पर स्वचालित रूप से चलता है। लिंट, टाइपचेक, टेस्ट, बिल्ड, और Docker इमेज को मान्य करता है (push किए बिना)।
- **release.yml** - `workflow_dispatch` के माध्यम से मैन्युअल रूप से ट्रिगर होता है। एक संस्करण टैग और GitHub रिलीज़ बनाने के लिए semantic-release चलाता है, फिर एक मल्टी-आर्क Docker इमेज (amd64 + arm64) बनाता है और Docker Hub (`snapotter/snapotter`) तथा GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`) पर push करता है।
- **deploy-docs.yml** - इस दस्तावेज़ीकरण साइट को बनाता है और `main` पर push होने पर इसे Cloudflare Pages पर तैनात करता है।

एक रिलीज़ बनाने के लिए, GitHub UI में **Actions > Release > Run workflow** पर जाएँ, या चलाएँ:

```bash
gh workflow run release.yml
```

Semantic-release कमिट इतिहास से संस्करण निर्धारित करता है। `latest` Docker टैग हमेशा सबसे हाल की रिलीज़ की ओर इंगित करता है।

## एनालिटिक्स {#analytics}

SnapOtter में बग पकड़ने और फ़ीचर सुधारने में मदद के लिए अनाम उत्पाद एनालिटिक्स (टूल उपयोग पैटर्न, त्रुटि रिपोर्ट) शामिल है। यह डिफ़ॉल्ट रूप से चालू है। आपकी फ़ाइलें, फ़ाइल नाम, और व्यक्तिगत डेटा इसका कभी हिस्सा नहीं होते। एनालिटिक्स अक्षम होने पर SnapOtter सामान्य रूप से काम करता है।

### एनालिटिक्स अक्षम करना {#disabling-analytics}

रनटाइम ऑप्ट-आउट एक एक-क्लिक एडमिन टॉगल है। Settings > System > Privacy खोलें और Anonymous Product Analytics बंद कर दें। यह तुरंत पूरे इंस्टेंस के लिए रुक जाता है, किसी रीबिल्ड की आवश्यकता नहीं।

एक ऐसी इमेज के लिए जो कभी एनालिटिक्स नहीं भेज सकती, रिपॉज़िटरी को क्लोन और रीबिल्ड करके बिल्ड-टाइम हार्ड-ऑफ़ सेट करें:

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
