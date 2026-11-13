---
description: "SnapOtter Docker image के tags, GPU benchmarks, version pinning, और AMD64 व ARM64 के लिए multi-platform सपोर्ट।"
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: 384a68a19498
i18n_hash_version: 2
---

# Docker Image {#docker-image}

SnapOtter एक ही Docker image के रूप में आता है। इसे अकेले चलाने पर यह loopback interface पर एक embedded PostgreSQL 17 और Redis शुरू कर देता है (embedded मोड); production के लिए इसे Compose के साथ अलग PostgreSQL 17 और Redis 8 containers के साथ चलाएँ। यह app image सभी platforms पर काम करती है।

## Quick start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

`DATABASE_URL` सेट न होने पर यह embedded मोड में चलता है: PostgreSQL और Redis container के अंदर loopback पर शुरू होते हैं, और सारा डेटा `SnapOtter-data` volume में रहता है। बाहरी सेवाओं का उपयोग करने के लिए `DATABASE_URL` और `REDIS_URL` सेट करें ([Compose](#docker-compose) stack यही करता है)। देखें [Configuration](/hi/guide/configuration#embedded-mode)।

## NVIDIA CUDA acceleration {#nvidia-cuda-acceleration}

इस image में amd64 पर NVIDIA CUDA सपोर्ट शामिल है। यदि आपके पास NVIDIA GPU है और [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) इंस्टॉल है, तो `--gpus all` जोड़ें:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Image runtime पर CUDA का अपने आप पता लगा लेती है। `--gpus all` के बिना, या CUDA उपलब्ध न होने पर, AI tools CPU पर चलते हैं। दोनों स्थितियों में image वही रहती है।

VA-API, Quick Sync, या OpenCL के ज़रिए Intel/AMD iGPU acceleration फ़िलहाल SnapOtter AI inference के लिए समर्थित नहीं है। `/dev/dri` को container में map करने से render device दिख सकता है, लेकिन CUDA उपलब्ध न होने पर AI runtime फिर भी CPU का ही उपयोग करेगा।

### Benchmarks {#benchmarks}

NVIDIA RTX 4070 (12 GB VRAM) पर 572x1024 JPEG portrait के साथ परीक्षण किया गया।

#### Warm performance {#warm-performance}

| Tool | CPU | GPU | Speedup |
|------|-----|-----|---------|
| Background removal (u2net) | 2,415ms | 879ms | 2.7x |
| Background removal (isnet) | 2,457ms | 1,137ms | 2.2x |
| Upscale 2x | 350ms | 309ms | 1.1x |
| Upscale 4x | 910ms | 310ms | 2.9x |
| Face blur | 139ms | 122ms | 1.1x |

#### Cold start (container शुरू होने के बाद पहला request) {#cold-start-first-request-after-container-start}

| Tool | CPU | GPU | Speedup |
|------|-----|-----|---------|
| Background removal | 22,286ms | 4,792ms | 4.7x |
| Upscale 2x | 3,957ms | 2,318ms | 1.7x |

OCR को CUDA तुलना में शामिल नहीं किया गया है। built-in Tesseract tier और वैकल्पिक RapidOCR/ONNX tiers दोनों CPU का उपयोग करते हैं, भले ही container के पास NVIDIA GPU का एक्सेस हो।

### CUDA health check {#cuda-health-check}

पहले AI request के बाद, admin health endpoint CUDA GPU की स्थिति बताता है:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

पूरे Compose stack में app, PostgreSQL 17, और Redis 8 शामिल हैं। पूरी `docker-compose.yml` के लिए [Deployment](/hi/guide/deployment) देखें। एक न्यूनतम उदाहरण:

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
      # Runtime role (rows only), then the boot-only owner connection.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    environment:
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

Docker Compose के ज़रिए NVIDIA CUDA acceleration के लिए, SnapOtter service में deploy section जोड़ें:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Version pinning {#version-pinning}

| Tag | विवरण |
|-----|------------|
| `latest` | नवीनतम release |
| `2.2.0` | सटीक version |
| `2.2` | 2.2.x में नवीनतम patch |
| `2` | 2.x में नवीनतम minor |

## Platforms {#platforms}

| Architecture | GPU सपोर्ट | नोट्स |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | AI tools के लिए पूर्ण CUDA acceleration |
| linux/arm64 | केवल CPU | Raspberry Pi 4/5, Docker Desktop के ज़रिए Apple Silicon |

## पिछले tags से माइग्रेशन {#migration-from-previous-tags}

यदि आप `:cuda` tag का उपयोग कर रहे थे, तो `:latest` पर स्विच करें और `--gpus all` रखें। GPU सपोर्ट वही है, image एकीकृत है।

आपका डेटा और सेटिंग्स volumes में सुरक्षित रहती हैं।
