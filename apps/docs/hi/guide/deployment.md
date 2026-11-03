---
description: "SnapOtter को Docker के साथ production में deploy करें। Hardware आवश्यकताएँ, GPU सेटअप, और Nginx, Traefik, व Cloudflare के लिए reverse proxy configs।"
i18n_source_hash: b8c4ed2cc086
i18n_provenance: machine
i18n_output_hash: 375fe96e1668
i18n_hash_version: 2
---

# Deployment {#deployment}

SnapOtter 3-container Docker Compose stack के रूप में deploy होता है: SnapOtter app image, PostgreSQL 17, और Redis 8। App image **linux/amd64** (AI acceleration के लिए NVIDIA CUDA के साथ) और **linux/arm64** (CPU) को सपोर्ट करती है, इसलिए यह Intel/AMD servers, Apple Silicon Macs, और Raspberry Pi 4/5 जैसे ARM devices पर native रूप से चलती है। VA-API, Quick Sync, या OpenCL के ज़रिए Intel/AMD iGPU acceleration फ़िलहाल AI inference के लिए समर्थित नहीं है।

GPU सेटअप, Docker Compose उदाहरणों, और version pinning के लिए [Docker Image](./docker-tags) देखें।

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

इसके बाद app `http://localhost:1349` पर उपलब्ध होता है।

ऊपर का stack database owner के रूप में कनेक्ट होता है। SnapOtter 2.3.0 से आप ऐसी role पर requests परोस सकते हैं जो केवल पंक्तियाँ पढ़ और लिख सकती है; [Least-privilege roles](./database#least-privilege-roles) देखें।

> **Docker Hub rate limits?** इसके बजाय GitHub Container Registry से pull करने के लिए `snapotter/snapotter:latest` को `ghcr.io/snapotter-hq/snapotter:latest` से बदलें। दोनों registries को हर release पर वही image मिलती है।

## Quick Start (NVIDIA CUDA) {#quick-start-nvidia-cuda}

समर्थित AI tools (background removal, upscaling, face enhancement) पर NVIDIA CUDA acceleration के लिए:

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

### GPU acceleration सत्यापित करें {#verify-gpu-acceleration}

Logs में CUDA detection जाँचें:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

यदि `--gpus all` और NVIDIA Container Toolkit सही ढंग से सेट होने के बावजूद AI tools CPU पर चलते हैं, तो प्रभावित bundle (उदाहरण के लिए Background Removal) को **Settings → AI Features** से दोबारा इंस्टॉल करें। Installer ONNX Runtime का GPU build बहाल कर देता है, जिसे किसी अन्य bundle (जैसे transcription) द्वारा खींचा गया CPU-only build साझा AI environment में अन्यथा ढक सकता है। यदि पुरानी image पर UI से दोबारा इंस्टॉल करने से GPU बहाल नहीं होता, तो [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490) में मैन्युअल मरम्मत देखें।

## Hardware Requirements {#hardware-requirements}

ये आँकड़े कई तरह के सिस्टमों पर किए गए benchmarks से आते हैं, NVIDIA RTX 4070 वाले आधुनिक amd64 workstation से लेकर Raspberry Pi तक, जिनमें से हर एक पर पूरा tool catalog चलाया गया और असली न्यूनतम सीमा खोजने के लिए Docker resource limits बदलकर देखी गईं।

इन tiers के छोटे छोर पर चला रहे हैं (Pi, पुराना laptop, 2 GB VPS)? [Low-Resource Setups](/hi/guide/low-resource) इन आँकड़ों को ट्यून की गई सीमाओं के साथ ठोस walkthrough में बदलता है।

### Quick Reference {#quick-reference}

| Tier | उपयोग का मामला | CPU | RAM | GPU | Storage |
|------|----------|-----|-----|-----|---------|
| Minimum | Non-AI tools (image, files, हल्का PDF) के साथ built-in Fast OCR और face detection; एक उपयोगकर्ता; छोटे batches | 2 cores | 2 GB | कोई नहीं | ~7 GB |
| Recommended | CPU पर video, PDF, और मानक AI bundles सहित सभी पाँच modalities; batches; कुछ उपयोगकर्ता | 4 cores | 4 GB (HQ inpainting के लिए 8 GB) | कोई नहीं | ~25 GB |
| Full | GPU AI सहित सब कुछ तेज़ गति से; बड़े batches; कई उपयोगकर्ता | 6-8 cores | 8 GB | NVIDIA 8 GB+ VRAM (12 GB आरामदायक) | ~35 GB |

**Architecture: केवल 64-bit** (`linux/amd64` या `linux/arm64`)। SnapOtter Intel/AMD servers, Apple Silicon Macs, और 64-bit ARM boards पर native रूप से चलता है, जिनमें **Raspberry Pi 4 और 5** (4-8 GB) शामिल हैं। यह 32-bit ARM (`armv7`/`armhf`) पर **नहीं** चलता, उसके लिए कोई image नहीं बनाई जाती, और न ही Pi Zero जैसे 512 MB-श्रेणी के boards पर, जो मेमोरी की न्यूनतम सीमा से नीचे हैं (नीचे देखें)।

### Minimum (image, files, और हल्के PDF tools; AI नहीं) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Resource | आवश्यकता |
|---|---|
| CPU | 2 cores |
| RAM | 2 GB |
| Disk | ~5.5 GB (image) + data volume |
| GPU | आवश्यक नहीं |

सभी 222 non-AI catalog tools, image (resize, crop, convert, compress, adjust, watermark), video (trim, mute, remux), audio (convert, normalize, trim), PDF (merge, split, compress, rotate, protect), फ़ाइल रूपांतरण, और समर्पित conversion presets, साधारण hardware पर चलते हैं। ज़्यादातर ऑपरेशन बड़ी फ़ाइल पर भी एक सेकंड से काफ़ी कम में पूरे हो जाते हैं: 2.7 MB की image ~0.05 s में resize होती है और ~2 s में WebP में re-encode हो जाती है।

मेमोरी की सीमा असली है, यह Docker resource-limit sweep से निकला है: **512 MB में stack शुरू नहीं हो सकता** (एक image resize भी kill हो जाता है), **1 GB** एकल-फ़ाइल ऑपरेशन सँभाल लेता है लेकिन multi-file batch में मेमोरी खत्म हो जाती है, और **2 GB / 2 cores** वह सबसे छोटा कॉन्फ़िगरेशन है जो non-AI batches को आराम से सँभालता है। Built-in Fast OCR और `face-detection` bundle भी 2 GB में समा जाते हैं, जबकि बड़े AI bundles (Whisper, LaMa/DDColor, rembg, RealESRGAN, photo restoration, और SD1.5 HQ inpainting) को 4 से 8 GB RAM चाहिए और खाली मेमोरी उनकी प्रति-bundle सीमा से कम होने पर उन्हें पहले ही अस्वीकार कर दिया जाता है।

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**CPU पर भारी पड़ने वाला एकमात्र अपवाद video re-encoding है।** Stream-copy ऑपरेशन (trim, mute, container remux) तुरंत होते हैं, लेकिन किसी दूसरे codec में transcode करना CPU-bound है। 1080p / 45-सेकंड की क्लिप को VP9 (WebM) में re-encode करने में तेज़ आधुनिक CPU पर लगभग **~40 s**, Apple Silicon पर ~45 s, पुराने मोबाइल 4-core पर ~80 s, और पुराने 4-core server पर **~130 s** लगते हैं। यदि आपका workload video-भारी है, तो CPU cores और clock speed को प्राथमिकता दें, या container की `cpus:` सीमा बढ़ाएँ: भेजा गया compose app को डिफ़ॉल्ट रूप से 4 cores पर सीमित करता है (GPU compose पर 8)।

### Recommended (CPU पर AI tools) {#recommended-ai-tools-on-cpu}

| Resource | आवश्यकता |
|---|---|
| CPU | 4 cores |
| RAM | 4 GB |
| Disk | 3 GB (image) + लगभग 20 GB (सभी वैकल्पिक AI packs) + workspace |
| GPU | आवश्यक नहीं (CPU fallback) |

**बड़े AI bundles को इंस्टॉल करना और चलाना ही सिफ़ारिश को 4 GB RAM तक पहुँचाता है।** कोई वैकल्पिक pack इंस्टॉल न होने पर app लगभग 360 MB पर idle रहता है। Legacy Python tools एक sidecar साझा करते हैं, जबकि accurate OCR एक समर्पित लंबे समय तक चलने वाला dispatcher उपयोग करता है जो सक्रिय immutable generation से जुड़ा रहता है। Activation से पहले, installer candidate पर smoke test चलाता है। फिर वह atomically नए dispatcher पर स्विच करता है और garbage collection से पहले पिछले dispatcher को drain करता है। हर आधिकारिक accurate-OCR artifact को 4 GiB cgroup के भीतर अपना सबसे बुरे-हाल वाला release suite पास करना होता है, जबकि 4 GB host सिफ़ारिश Node.js application, Postgres, Redis, queues, और एक साथ होने वाले काम के लिए गुंजाइश छोड़ती है।

ज़्यादातर AI tools CPU पर पूरी तरह उपयोग योग्य हैं; कुछ को सचमुच GPU चाहिए। आधुनिक 4-core CPU पर मापा गया:

| AI Tool | CPU समय | क्या CPU पर उपयोग योग्य है? |
|---|---|---|
| Face detection (blur-faces, smart-crop, red-eye), noise-removal | 1 s से कम | हाँ |
| OCR, transcription, subtitles | 1-3 s | हाँ |
| Colorize, face enhancement | ~10 s | हाँ |
| Background removal / replace / blur | ~29 s | हाँ (इंतज़ार करना होगा) |
| AI upscale (RealESRGAN) | छोटी के लिए ~33 s; बड़ी images पर मिनट | सीमित: GPU की पुरज़ोर सिफ़ारिश |
| Photo restoration (पूरी pipeline) | कई मिनट | नहीं: GPU या तेज़ many-core CPU चाहिए |

SnapOtter जानबूझकर इन model downloads को Docker image में नहीं डालता। AI bundles तभी खींचे जाते हैं जब कोई admin संबंधित tool सक्षम करे, स्थायी `/data/ai` volume में रखे जाते हैं, और उसी model stack पर निर्भर हर tool द्वारा साझा किए जाते हैं। इससे अंतिम container image छोटी रहती है, जबकि पूर्ण AI इंस्टॉलेशन नीचे दी गई बड़ी storage संख्याओं तक पहुँच सकता है।

कुछ tools एक से अधिक साझा bundle पर निर्भर करते हैं। उदाहरण के लिए, Passport Photo को `background-removal` और `face-detection` दोनों चाहिए; यदि `background-removal` पहले से इंस्टॉल है, तो Passport Photo सक्षम करने पर केवल छूटा हुआ `face-detection` bundle डाउनलोड होता है। यही पुन: उपयोग सभी AI tools पर लागू होता है।

वैकल्पिक AI pack storage और CPU मेमोरी सीमाएँ (SnapOtter Python sidecar को भेजने से पहले उपलब्ध मेमोरी जाँचता है और खाली मेमोरी bundle की सीमा से कम होने पर रन को तुरंत अस्वीकार कर देता है):

| Bundle | Disk आकार | CPU मेमोरी सीमा |
|---|---|---|
| Face detection | 200-300 MB | 2 GB host RAM (~0.5 GB खाली) |
| Transcription | ~600 MB | 4 GB host RAM (~2 GB खाली) |
| Object eraser + Colorize | 1-2 GB | 4 GB host RAM (~2 GB खाली) |
| Accurate OCR (`balanced`/`best`) | ~208-234 MiB download / ~409-488 MiB इंस्टॉल किया हुआ | 4 GiB कॉन्फ़िगर की गई effective memory (`fast` 2 GB पर चलता है) |
| Background removal | 4-5 GB | 4 GB host RAM (~2.5 GB खाली) |
| Upscale + Face enhance + Noise removal | 5-6 GB | 4 GB host RAM (~2.5 GB खाली) |
| Photo restoration | 4-5 GB | 4 GB host RAM (~3 GB खाली) |
| High-Quality Inpainting (`inpaint-hq`) | 5-7 GB | 8 GB host RAM (~6 GB खाली) |
| **सभी bundles** | **~25 GB इंस्टॉल किए हुए** | **4 GB (`inpaint-hq` के साथ 8 GB)** |

Fast OCR Tesseract के ज़रिए image में ही बनी है, लगभग 25 MiB जोड़ती है, और उसे वैकल्पिक OCR pack या उसकी 4 GiB मेमोरी आवश्यकता की ज़रूरत नहीं है। Fast `auto`, `en`, `de`, `es`, `fr`, `zh`, और `ja` को सपोर्ट करता है, लेकिन Korean (`ko`) या Arabic (`ar`) को नहीं। दोनों `balanced` या `best` का उपयोग करते हैं और इसलिए accurate pack की ज़रूरत होती है। Accurate pack आधिकारिक Linux amd64 और arm64 containers में उपलब्ध है और CPU पर ONNX Runtime चलाता है। NVIDIA hosts भी वही CPU OCR runtime उपयोग करते हैं, इसलिए OCR CUDA version या GPU architecture पर निर्भर नहीं करता। Accurate runtime को कम से कम 4 GiB effective memory चाहिए: कॉन्फ़िगर की गई container cgroup सीमा, अन्यथा host memory। SnapOtter pack डाउनलोड करने से पहले उस signed compatibility न्यूनतम से नीचे वाले सिस्टमों को अस्वीकार कर देता है। Accurate-pack इंस्टॉलेशन उन bare-metal/prebuilt archives पर भी अस्वीकार किया जाता है जिनके libc और Python ABI की गारंटी नहीं दी जा सकती। उन असमर्थित hosts पर, Korean और Arabic OCR स्पष्ट असंगति त्रुटि लौटाते हैं और चुपचाप Fast पर कभी नहीं लौटते।

जो replicas एक ही `DATA_DIR` साझा करते हैं उन्हें एक ही CPU architecture का होना चाहिए; multi-replica deployments को node affinity से pin करें। मिश्रित amd64/arm64 replicas को अलग data volumes और स्वतंत्र SnapOtter deployments चाहिए।

Accurate runtime एक सक्रिय generation रखता है और activation के बाद अपना download cache साफ़ कर देता है। इस release के लिए, पहले इंस्टॉल में archive और staging के लिए अस्थायी रूप से लगभग 620-720 MiB चाहिए, और अपग्रेड में, जब तक पुरानी generation सक्रिय रहती है, उपयोग लगभग 1.2 GiB तक पहुँच सकता है। Installer डाउनलोड या extract करने से पहले signed index और मौजूदा generations से सटीक आवश्यकता की गणना करता है, और data volume बहुत छोटा होने पर जल्दी विफल हो जाता है।

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Full (NVIDIA CUDA पर AI tools) {#full-ai-tools-on-nvidia-cuda}

| Resource | आवश्यकता |
|---|---|
| CPU | 6-8 cores (GPU AI के साथ भी video prep और concurrency CPU पर चलते हैं) |
| RAM | 8 GB |
| GPU | 8+ GB VRAM वाला NVIDIA (12 GB अनुशंसित) |
| Disk | कुल ~35 GB |

NVIDIA GPU (CUDA) भारी AI models को नाटकीय रूप से तेज़ कर देता है। RTX 4070 बनाम आधुनिक CPU पर मापा गया:

| AI Tool | GPU के साथ speedup | नोट्स |
|---|---|---|
| AI upscale (RealESRGAN 2×) | **~47×** | सबसे बड़ा लाभ: एक सेकंड से कम बनाम ~33 s (बड़ी images पर मिनट) |
| Face enhancement (CodeFormer) | **~12×** | ~0.9 s बनाम ~11 s |
| Transcription (Whisper) | ~4.5× | |
| Background removal / replace / blur | ~4× | GPU पर ~7 s बनाम CPU पर ~29 s |
| Colorize | ~1.8× | |
| OCR, face detection, red-eye, noise-removal | ~1× | CPU पर पहले से तेज़: GPU से मदद नहीं मिलती |
| Photo restoration | कोई नहीं | GPU पर भी CPU-bound (0% GPU उपयोग); यहाँ GPU से ज़्यादा तेज़ CPU मायने रखता है |

GPU के लायक tools हैं **upscale, face enhancement, transcription, और background removal**। Face detection, OCR, और red-eye CPU-bound हैं और पहले से तेज़ हैं, इसलिए GPU कुछ नहीं जोड़ता।

Face enhancement के साथ upscale के दौरान peak VRAM उपयोग 7.5 GB तक पहुँचता है। 6 GB का NVIDIA GPU ज़्यादातर AI tools के लिए अलग-अलग काम करता है लेकिन upscale पर विफल होगा। 8-12 GB VRAM सब कुछ सँभाल लेता है।

VA-API, Quick Sync, या OpenCL के ज़रिए Intel/AMD iGPU acceleration फ़िलहाल AI inference के लिए समर्थित नहीं है। `/dev/dri` को container में map करने से AI GPU acceleration सक्षम नहीं होता; NVIDIA CUDA उपलब्ध न होने पर SnapOtter AI tools को CPU पर चलाएगा।

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

डिफ़ॉल्ट 4-core-सीमित app container पर समानांतर image-resize requests:

| समवर्ती Requests | औसत Response समय | त्रुटियाँ |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

Worker pool के संतृप्त होने पर response समय बिना त्रुटियों के sub-linear रूप से बिगड़ता है। App container की `cpus:` सीमा बढ़ाने (या अधिक cores वाला host उपयोग करने) से ऊपरी सीमा बढ़ती है। ध्यान दें कि भारी jobs (video transcode, CPU AI) अपनी पूरी अवधि तक एक worker को थामे रखते हैं, इसलिए CPU का आकार केवल requests की संख्या के बजाय अपेक्षित समवर्ती भारी jobs की संख्या के अनुसार तय करें।

### समर्थित Image Formats {#supported-image-formats}

SnapOtter **55+ input formats** और **14 output formats** को सपोर्ट करता है, जिनमें 20+ camera brands की RAW फ़ाइलें, professional formats (PSD, EPS, OpenEXR, HDR), आधुनिक codecs (JPEG XL, AVIF, HEIC, QOI), और वैज्ञानिक/gaming formats (FITS, DDS) शामिल हैं।

हर समर्थित format, उपयोग किए गए decoder, और उपलब्ध quality controls के विवरण के लिए [पूरी format सूची](/hi/guide/supported-formats) देखें।

### ज्ञात सीमाएँ {#known-limitations}

- **Content-aware resize** बड़ी images (>5 MP) पर caire binary की एक सीमा के कारण crash होता है। छोटी images के साथ ठीक काम करता है।
- **HEIF decode** में 13-23 सेकंड लगते हैं। HEIC (Apple का संस्करण) 0.3-0.9 सेकंड में बहुत तेज़ है।
- **Upscale** छोटी images से बड़ी किसी भी चीज़ के लिए CPU पर time out हो जाता है। व्यावहारिक उपयोग के लिए GPU आवश्यक है।
- **CodeFormer** face enhancement GFPGAN से काफ़ी धीमा है (GPU पर 53s बनाम 2s)। ज़्यादातर उपयोग मामलों के लिए GFPGAN की सिफ़ारिश की जाती है।

## Volumes {#volumes}

| Mount / Volume | उद्देश्य | आवश्यक? |
|---|---|---|
| `/data` (app) | AI models, Python venv, उपयोगकर्ता फ़ाइलें | **हाँ**, इसके बिना फ़ाइलें खो जाएँगी |
| `/tmp/workspace` (app) | अस्थायी processing फ़ाइलें (अपने आप साफ़ होती हैं) | अनुशंसित |
| `SnapOtter-pgdata` (postgres) | PostgreSQL data directory (users, सेटिंग्स, pipelines, jobs) | **हाँ**, इसके बिना डेटा खो जाएगा |
| `SnapOtter-redisdata` (redis) | Durable job queues के लिए Redis append-only फ़ाइल | अनुशंसित |

### Bind mounts बनाम named volumes {#bind-mounts-vs-named-volumes}

**Named volumes** (अनुशंसित): Docker permissions अपने आप सँभालता है:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounts**: permissions आप सँभालते हैं। `PUID`/`PGID` को अपने host उपयोगकर्ता से मिलाकर सेट करें:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Storage permissions {#storage-permissions}

SnapOtter runtime पर दो स्थानों पर लिखता है: `/data` (उपयोगकर्ता फ़ाइलें, logs, AI models और Python venv) और `/tmp/workspace` (अस्थायी processing scratch)। दोनों उस उपयोगकर्ता द्वारा writable होने चाहिए जिसके रूप में container चलता है। यदि कोई एक नहीं है, तो container **startup पर तुरंत विफल** हो जाता है और एक संदेश देता है जिसमें directory का नाम, चल रहा UID/GID, और इसे ठीक करने का तरीका होता है, बजाय इसके कि वह "healthy" boot हो और फिर पहले upload पर किसी रहस्यमय त्रुटि के साथ विफल हो। Log directory (`LOG_DIR`, image में `/data/logs`) की जाँच भी हर storage मोड में उसी तरह की जाती है, क्योंकि फ़ाइलें S3 में होने पर भी logs local रहते हैं।

Permissions कैसे सँभाली जाती हैं, यह इस पर निर्भर करता है कि container कैसे शुरू किया गया है:

**Default (root के रूप में शुरू होता है, `snapotter` पर आ जाता है)**: entrypoint root के रूप में शुरू होता है, mount किए गए volumes की ownership ठीक करता है, फिर `gosu` के ज़रिए बिना विशेषाधिकार वाले `snapotter` उपयोगकर्ता पर आ जाता है। Named volumes बिना किसी कॉन्फ़िगरेशन के काम करते हैं। Bind mounts के लिए, `PUID`/`PGID` को अपने host उपयोगकर्ता पर सेट करें (ऊपर) ताकि यह जो फ़ाइलें लिखे वे आपके स्वामित्व की हों।

**Kubernetes / OpenShift (`runAsUser` के ज़रिए non-root)**: सीधे non-root उपयोगकर्ता के रूप में शुरू होने पर, container volumes पर खुद chown नहीं कर सकता, इसलिए orchestrator को उन्हें writable बनाना होगा। `fsGroup` सेट करें:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Image की writable directories का group-स्वामित्व GID 0 के पास है और वे group-writable हैं, इसलिए **मनमाने UID** के साथ root supplementary group (OpenShift का डिफ़ॉल्ट) पर चलने वाला pod बिना `chown` के लिख सकता है।

**TrueNAS Scale (और अन्य "foreign UID" सेटअप)**: TrueNAS apps को non-root उपयोगकर्ता (अक्सर `568:568`) के रूप में चलाता है और किसी दूसरे उपयोगकर्ता के स्वामित्व वाले host datasets mount करता है, इसलिए न entrypoint और न `fsGroup` अकेले उन्हें writable बना पाता है। कोई एक चुनें:

- **App को root के रूप में चलाएँ** (अनुशंसित): app का user अनसेट छोड़ दें या `0` पर सेट करें, और default entrypoint को permissions ठीक करने और `snapotter` पर आने दें।
- **UID `999` के रूप में चलाएँ**: app का user/group `999:999` पर सेट करें (SnapOtter का built-in `snapotter` उपयोगकर्ता) ताकि वह image की ownership से मेल खाए।
- **Host dataset पर `chown` करें**, उस UID पर जिसके रूप में container चलता है, TrueNAS shell से:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Startup त्रुटि उपयोग करने के लिए सटीक UID बताती है, इसलिए सबसे तेज़ रास्ता है app को एक बार शुरू करना, संदेश पढ़ना, फिर उसी के अनुसार `chown` करना (या user बदलना)।

## Environment Variables {#environment-variables}

| Variable | Default | विवरण |
|---|---|---|
| `AUTH_ENABLED` | `true` | Login आवश्यकता सक्षम/अक्षम करें |
| `DEFAULT_USERNAME` | `admin` | शुरुआती admin username |
| `DEFAULT_PASSWORD` | `admin` | शुरुआती admin पासवर्ड (पहले login पर बदलना अनिवार्य) |
| `MAX_UPLOAD_SIZE_MB` | `0` (असीमित) | MB में प्रति-फ़ाइल upload सीमा। Image `0` के साथ आती है; source build 100 से शुरू होता है |
| `MAX_BATCH_SIZE` | `0` (असीमित) | प्रति batch request अधिकतम फ़ाइलें। Image `0` के साथ आती है; source build 100 से शुरू होता है |
| `RATE_LIMIT_PER_MIN` | `1000` | प्रति IP प्रति मिनट API requests (बंद करने के लिए 0 सेट करें) |
| `MAX_USERS` | `0` (असीमित) | अधिकतम उपयोगकर्ता खाते |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | कौन से peers `X-Forwarded-For` के ज़रिए client IP सेट कर सकते हैं। डिफ़ॉल्ट रूप से केवल निजी networks |
| `PUID` | `999` | इस UID के रूप में चलाएँ (bind mount permissions के लिए) |
| `PGID` | `999` | इस GID के रूप में चलाएँ (bind mount permissions के लिए) |
| `LOG_LEVEL` | `info` | Log विस्तार स्तर: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | अधिकतम समानांतर AI processing jobs |
| `SESSION_DURATION_HOURS` | `168` | Login session की अवधि (7 दिन) |
| `CORS_ORIGIN` | (खाली) | अल्पविराम से अलग की गई अनुमत origins, या same-origin के लिए खाली |

### Outbound proxy और private CA {#outbound-proxy-and-private-ca}

आधिकारिक container Node का environment-proxy सपोर्ट सक्षम करता है। यदि SnapOtter को OCR runtime repository या अन्य HTTPS services तक corporate proxy के ज़रिए पहुँचना है, तो `HTTPS_PROXY` सेट करें (और ज़रूरत हो तो `HTTP_PROXY`)। `NO_PROXY` को उन hosts की अल्पविराम से अलग सूची पर सेट करें जिन तक सीधे पहुँचना ज़रूरी है, जैसे Postgres, Redis, और आंतरिक object storage।

यदि proxy या कोई आंतरिक service किसी private certificate authority द्वारा signed है, तो CA certificate को read-only mount करें और `NODE_EXTRA_CA_CERTS` को उसकी ओर इंगित करें। Node process शुरू होते समय फ़ाइल मौजूद होनी चाहिए:

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

Proxy credentials को Compose फ़ाइल के बाहर रखें (उदाहरण के लिए किसी सुरक्षित `.env` फ़ाइल या secret में)। TLS verification बंद न करें: signed OCR index release metadata को प्रमाणित करता है, जबकि सामान्य TLS validation अब भी transport और हर अन्य outbound request की रक्षा करता है।

## Health Check {#health-check}

Container में built-in health check शामिल है:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse Proxy {#reverse-proxy}

`TRUST_PROXY` का डिफ़ॉल्ट `loopback,linklocal,uniquelocal` है, इसलिए SnapOtter `X-Forwarded-For` पर केवल निजी network के peer से ही भरोसा करता है। उसी host पर, Docker network पर, या आपके LAN पर मौजूद reverse proxy पर बिना किसी सेटअप के भरोसा किया जाता है, यानी rate limiting, login brute-force limiter, audit log, और enterprise IP allowlist सभी बिना किसी कॉन्फ़िगरेशन के असली client IP देखते हैं।

`TRUST_PROXY=true` केवल तभी सेट करें जब सामने वाला proxy SnapOtter तक **सार्वजनिक** पते से पहुँचे, उदाहरण के लिए किसी दूसरे network पर cloud load balancer। सीधे उजागर instance पर वह मान `request.ip` को हमलावर के नियंत्रण में दे देता है, क्योंकि header बदलने वाला caller हर request पर नया rate-limit bucket पा जाता है।

Client IPs मापने जाने से पहले दो बातें जान लें। macOS और Windows पर Docker Desktop published port को userland proxy के ज़रिए परोसता है जो हर source address को VM gateway `192.168.65.1` में बदल देता है, इसलिए `TRUST_PROXY` का कोई भी मान वहाँ असली client को वापस नहीं ला सकता; इंटरनेट-सामने वाली किसी भी चीज़ के लिए Linux पर deploy करें। और किसी भी platform पर, `localhost` के ज़रिए published port तक पहुँचना आपके client के बजाय bridge gateway के रूप में दिखता है, इसलिए localhost परीक्षण से यह पता नहीं चलता कि असली client को कैसे पहचाना जाता है। `TRUST_PROXY` मानों की पूरी तालिका और Docker Desktop की चेतावनी [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy) में हैं।

नीचे के हर proxy के लिए दो बातें मायने रखती हैं: बड़े request bodies (uploads) की अनुमति दें, और responses को buffer न करें। Response-buffering वाला proxy SSE progress को तोड़ देता है और, ज़्यादा स्पष्ट रूप से, बड़ी फ़ाइल के download को "शुरू होकर कभी खत्म न होने वाला" बना देता है, क्योंकि proxy पूरी फ़ाइल को आगे भेजने से पहले अपने पास रोक लेता है। SnapOtter downloads पर `X-Accel-Buffering: no` भेजता है ताकि nginx उन्हें stream करे, भले ही कहीं और buffering चालू छूट गई हो, लेकिन nginx के अलावा अन्य proxies में response buffering स्पष्ट रूप से बंद करनी होती है (नीचे हर config में दिखाया गया है)। यदि कोई download बीच में अटक जाए, तो सबसे पहले सामने बैठे buffering proxy को जाँचें।

HSTS पर एक नोट: API हर response पर `Strict-Transport-Security` खुद भेजता है, इसलिए जो proxy response headers को आगे पास करता है (नीचे के सभी configs ऐसा करते हैं) उसे अपने HSTS सेटअप की ज़रूरत नहीं है। केवल तभी जब आपका proxy upstream response headers को हटाने या बदलने के लिए कॉन्फ़िगर किया गया हो, आपको header को सुरक्षित रखना होगा या edge पर दोबारा जोड़ना होगा।

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

### Subpath के अंतर्गत Deploy करना {#subpath}

`https://example.com/snapotter` पर परोसने के लिए, SnapOtter container के environment में
`BASE_PATH=/snapotter` सेट करें और उसे restart करें। आधिकारिक CPU और GPU Compose
फ़ाइलें भी आपके shell या Compose `.env` फ़ाइल से `BASE_PATH` स्वीकार करती हैं। वही
image किसी भी path पर काम करती है; frontend rebuild की ज़रूरत नहीं है।

`BASE_PATH` अक्षरों, अंकों, `_`, या
`-` वाले slash-से-अलग segments स्वीकार करता है, जिनमें `/apps/snapotter` जैसे nested paths भी शामिल हैं। अंत का slash
वैकल्पिक है। Root deployment के लिए इसे खाली छोड़ें (डिफ़ॉल्ट), या `/` सेट करें।

अपने मौजूदा Nginx HTTPS server block में यह उपयोग करें:

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

यह उदाहरण prefix को सुरक्षित रखता है। जो proxies forward करने से पहले `/snapotter` को हटा देते हैं वे भी
समर्थित हैं। आंतरिक health checks `/api/v1/health` का उपयोग जारी रख सकते हैं। OIDC या SAML के लिए, `EXTERNAL_URL=https://example.com/snapotter`
भी सेट करें और identity provider के
callback URLs को अपडेट करें ताकि उनमें क्रमशः `/snapotter/api/auth/oidc/callback` या
`/snapotter/api/auth/saml/callback` शामिल हो।

API scripts बिना बदलाव के काम करती रहती हैं: API responses में URLs, जैसे किसी tool का
`downloadUrl`, `BASE_PATH` चाहे जो हो, `/api/` से शुरू होते हैं। उन्हें domain root के विरुद्ध हल करने के बजाय अपने
instance के base URL (`https://example.com/snapotter` + `/api/v1/download/...`)
में जोड़ें।

UI को prefix वाले URL (`https://example.com/snapotter`) से खोलें। जो
browser prefix के बिना पहुँचता है उसे अपने आप वहाँ भेज दिया जाता है; केवल API
requests के prefix के बिना app तक पहुँचने की अपेक्षा की जाती है। यदि logs में
`Requests arrive under /snapotter/ but BASE_PATH is empty` दिखे, तो आपका proxy ऐसा prefix forward कर रहा है जिसे `BASE_PATH` घोषित नहीं करता: `BASE_PATH` को उस पर सेट करें,
या proxy पर prefix हटा दें।

### Nginx Proxy Manager {#nginx-proxy-manager}

1. नया Proxy Host जोड़ें
2. Domain Name को अपने domain पर सेट करें
3. Scheme को `http` पर, Forward Hostname को `SnapOtter` (या अपने container IP) पर, Forward Port को `1349` पर सेट करें
4. WebSocket सपोर्ट सक्षम करें
5. Advanced के अंतर्गत जोड़ें: `client_max_body_size 500M;` और `proxy_buffering off;`

API का `Strict-Transport-Security` header NPM से ज्यों का त्यों गुज़रता है; SSL टैब पर HSTS टॉगल उसके ऊपर वैकल्पिक है।

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

Traefik upstream response headers को बिना बदले आगे भेजता है, इसलिए API का `Strict-Transport-Security` header `headers` middleware के बिना browsers तक पहुँचता है। यदि आप पहले से ऐसा middleware चलाते हैं जो response headers को बदलता है, तो सुनिश्चित करें कि वह उस header को अछूता छोड़ता है।

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

`flush_interval -1` response buffering बंद करता है, जो SSE progress events (batch processing, AI tools, feature installs) के लिए और बड़े फ़ाइल downloads के अटकने के बजाय stream होने के लिए आवश्यक है। बढ़ाए गए timeouts बड़े फ़ाइल uploads को Caddy द्वारा connection जल्दी बंद किए बिना पूरा होने देते हैं। Caddy API के `Strict-Transport-Security` header को भी अछूता पास करता है, इसलिए HSTS के लिए किसी `header` directive की ज़रूरत नहीं है।

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

नोट: Cloudflare की free plans पर 100 MB की upload सीमा है। उससे मेल खाने के लिए `MAX_UPLOAD_SIZE_MB=100` सेट करें।

Tunnel API के response headers को आगे भेजता है, `Strict-Transport-Security` सहित, इसलिए dashboard में HSTS कॉन्फ़िगरेशन की ज़रूरत नहीं है (Cloudflare की अपनी edge HSTS सेटिंग उसके ऊपर वैकल्पिक है)।

## Troubleshooting {#troubleshooting}

### विफल पहले start के तुरंत बाद "Postgres not reachable: EAI_AGAIN" {#eai-again-after-failed-first-start}

यदि बिलकुल पहला `docker compose up -d` बीच में विफल हो जाता है (आम कारण: कोई port पहले से उपयोग में होना), तो सादा `up -d` दोबारा चलाने पर app container compose network से जुड़े बिना शुरू हो सकता है। तब app इस त्रुटि के साथ crash-loop में चला जाता है:

```
Postgres not reachable: EAI_AGAIN
```

जबकि `docker ps` में postgres healthy दिखता है। त्रुटि असली है लेकिन गलत container की ओर इशारा करती है: network के बिना, `postgres` hostname का DNS हल हो ही नहीं सकता, और restart policy वही विफलता हमेशा दोहराती रहती है।

जो भी पहले start को तोड़ रहा था उसे ठीक करें (आम तौर पर: port खाली करें), फिर app container को बलपूर्वक दोबारा बनाएँ ताकि वह network से दोबारा जुड़ जाए:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: अन्य devices से पहुँच योग्य, खुद PC से नहीं {#windows-wsl2-loopback}

WSL2 के भीतर चल रहे Docker के साथ (सामान्य Windows सेटअप), stack आपके network की हर दूसरी मशीन से पहुँच योग्य हो सकता है जबकि `http://localhost:1349` खुद Windows host पर time out हो जाता है, WSL का mirrored networking मोड सक्षम होने पर भी। Port Windows के `netstat` में कभी नहीं दिखता, और containers में कुछ गलत नहीं है।

App को किसी दूसरे device से खोलें, या distro के अंदर से उसके अपने पते का उपयोग करके (WSL shell में `hostname -I`)। यदि आपके WSL version पर localhost forwarding संयोग से काम करता है, तो उसे बोनस मानें, ऐसी चीज़ नहीं जिस पर निर्भर रहा जाए।

## CI/CD {#ci-cd}

GitHub रिपॉज़िटरी में तीन workflows हैं:

- **ci.yml**: हर push और PR पर अपने आप चलता है। Lint, typecheck, test, build करता है, और Docker image को (push किए बिना) validate करता है।
- **release.yml**: `workflow_dispatch` के ज़रिए मैन्युअल रूप से ट्रिगर होता है। Version tag और GitHub release बनाने के लिए semantic-release चलाता है, फिर multi-arch Docker image (amd64 + arm64) बनाता है और Docker Hub (`snapotter/snapotter`) और GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`) पर push करता है।
- **deploy-docs.yml**: इस documentation साइट को build करता है और `main` पर push होने पर Cloudflare Pages पर deploy करता है।

Release बनाने के लिए, GitHub UI में **Actions > Release > Run workflow** पर जाएँ, या यह चलाएँ:

```bash
gh workflow run release.yml
```

Semantic-release commit history से version तय करता है। `latest` Docker tag हमेशा सबसे हाल की release की ओर इशारा करता है।

## Analytics {#analytics}

SnapOtter में गुमनाम product analytics (tool उपयोग के पैटर्न, त्रुटि रिपोर्ट) शामिल हैं ताकि bugs पकड़ने और फ़ीचर्स सुधारने में मदद मिले। यह डिफ़ॉल्ट रूप से चालू है। आपकी फ़ाइलें, फ़ाइल नाम, और व्यक्तिगत डेटा इसका हिस्सा कभी नहीं होते। Analytics बंद होने पर भी SnapOtter सामान्य रूप से काम करता है।

### Analytics बंद करना {#disabling-analytics}

Runtime opt-out एक-क्लिक वाला admin टॉगल है। Settings > System > Privacy खोलें और Anonymous Product Analytics बंद करें। यह पूरे instance के लिए तुरंत बंद हो जाता है, rebuild की ज़रूरत नहीं।

ऐसी image के लिए जो कभी analytics emit न कर सके, रिपॉज़िटरी को clone करके और rebuild करके build-time hard-off सेट करें:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

या अपने मौजूदा `docker-compose.yml` में build arg जोड़ें:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
