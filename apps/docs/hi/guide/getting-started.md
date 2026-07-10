---
description: "एक ही command में Docker के साथ SnapOtter इंस्टॉल करें। इसमें Docker Compose सेटअप, स्रोत से बिल्ड करना, और पूर्ण फ़ीचर अवलोकन शामिल है।"
i18n_source_hash: d2366a2e051c
i18n_provenance: human
i18n_output_hash: 6fc39cbb13e4
---

# Getting Started {#getting-started}

::: tip इंस्टॉल करने से पहले आज़माएँ
पूरा UI [demo.snapotter.com](https://demo.snapotter.com) पर एक्सप्लोर करें - कोई signup या install ज़रूरी नहीं।
:::

## Quick Start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

यह single container वह सब कुछ चलाता है जिसकी उसे ज़रूरत है: कोई `DATABASE_URL` सेट न होने पर, यह loopback interface पर अपना खुद का PostgreSQL और Redis शुरू करता है (embedded mode) और सारा data `SnapOtter-data` volume में रखता है। SnapOtter आज़माने या homelab पर self-host करने का यह सबसे तेज़ तरीका है। production के लिए, नीचे दिया [Docker Compose](#docker-compose) stack चलाएँ, जो PostgreSQL और Redis को उनके अपने containers में रखता है। Embedded mode root के रूप में चलता है (डिफ़ॉल्ट) और जैसे ही आप `DATABASE_URL` सेट करते हैं, यह अपने आप बंद हो जाता है।

पहली बार login करने पर आपसे अपना password बदलने के लिए कहा जाएगा।

::: tip Anonymous Product Analytics
SnapOtter में डिफ़ॉल्ट रूप से anonymous product analytics शामिल है। इसे बंद करने के लिए, **Settings → System → Privacy** खोलें और **Anonymous Product Analytics** को बंद कर दें। यह पूरे instance के लिए तुरंत रुक जाता है।

क्या-क्या एकत्र किया जाता है, इसके विवरण के लिए देखें [SnapOtter क्या एकत्र करता है](/hi/guide/telemetry)।
:::

::: tip NVIDIA CUDA acceleration
NVIDIA CUDA-accelerated background removal, upscaling, OCR, face enhancement, और restoration के लिए `--gpus all` जोड़ें:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

इसके लिए [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) आवश्यक है। CUDA अनुपलब्ध होने पर यह अपने आप CPU पर वापस चला जाता है। VA-API, Quick Sync, या OpenCL के माध्यम से Intel/AMD iGPU acceleration फ़िलहाल AI inference के लिए समर्थित नहीं है। बेंचमार्क के लिए [Docker Tags](/hi/guide/docker-tags) देखें।
:::

::: details GHCR पर भी
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

दोनों registries हर release पर वही image प्रकाशित करते हैं।
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

सभी environment variables के लिए [Configuration](/hi/guide/configuration) देखें।

## Build from Source {#build-from-source}

**पूर्वापेक्षाएँ:** Node.js 22+, pnpm 9+, Docker (Postgres + Redis के लिए), Python 3.10+ (AI features के लिए), Git।

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## आप क्या कर सकते हैं {#what-you-can-do}

### File Processing (241 Tools) {#file-processing-241-tools}

| Modality | Count | उदाहरण Tools |
|----------|-------|---------------|
| **Image** | 105 | Resize, Crop, Compress, Convert, Remove Background, Upscale, OCR, Watermark, Collage, Colorize, GIF Tools, format presets |
| **Video** | 57 | Trim, Crop, Compress, Convert, Merge, Extract Audio, Auto Subtitles, Video to GIF, Resize, Stabilize, format presets |
| **Audio** | 27 | Trim, Merge, Convert, Normalize, Noise Reduction, Transcribe, Pitch Shift, Fade, Ringtone Maker, format presets |
| **PDF / Document** | 42 | Merge, Split, Compress, OCR, Watermark, Redact, Word to PDF, Excel to PDF, Rotate, Protect, Repair |
| **Files** | 10 | CSV to JSON, JSON to XML, Merge CSVs, Split CSV, Create ZIP, Extract ZIP, Chart Maker, YAML/JSON |

### Pipelines {#pipelines}

tools को multi-step workflows में जोड़ें और उन्हें एक image या पूरे batch पर लागू करें:

1. sidebar में **Pipelines** खोलें।
2. steps जोड़ें (कोई भी tool, कोई भी settings)।
3. किसी एक file पर चलाएँ - या एक साथ पूरे batch पर।
4. बाद में दोबारा उपयोग के लिए pipeline को save करें।

Pipelines डिफ़ॉल्ट रूप से 20 steps की अनुमति देते हैं। limit को असीमित करने के लिए `MAX_PIPELINE_STEPS=0` सेट करें।

### File Library {#file-library}

आप जो भी file process करते हैं, उसे अपनी **Files** library में save किया जा सकता है। SnapOtter पूरी version history को ट्रैक करता है ताकि आप मूल upload से लेकर अंतिम output तक हर processing step का पता लगा सकें।

Saving स्पष्ट है: जो results आप library में save करते हैं, उन्हें आपके delete करने तक रखा जाता है, जबकि जो results आप process करके unsaved छोड़ देते हैं, वे 72 घंटों के बाद अपने आप हट जाते हैं (`FILE_MAX_AGE_HOURS` के माध्यम से configurable)।

### REST API और API Keys {#rest-api-api-keys}

हर tool HTTP के माध्यम से पहुँच योग्य है:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

**Settings → API Keys** के अंतर्गत API keys जनरेट करें। सभी endpoints के लिए [REST API reference](/hi/api/rest) देखें, या interactive reference के लिए [http://localhost:1349/api/docs](http://localhost:1349/api/docs) पर जाएँ।

### Multi-User और Teams {#multi-user-teams}

role-based access control के साथ अनेक users सक्षम करें:

- **Admin**: पूर्ण पहुँच - users, teams, settings, सभी files/pipelines/API keys प्रबंधित करें
- **User**: tools का उपयोग करें, अपनी files/pipelines/API keys प्रबंधित करें

users को समूहित करने के लिए **Settings → Teams** के अंतर्गत teams बनाएँ।

`AUTH_ENABLED=true` सेट करें (या login के बिना single-user/स्वयं-उपयोग के लिए `false`)।
