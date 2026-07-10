---
description: "SnapOtter Docker image टैग, GPU बेंचमार्क, वर्शन पिनिंग, और AMD64 तथा ARM64 के लिए मल्टी-प्लेटफ़ॉर्म समर्थन।"
i18n_source_hash: 148b3608e11a
i18n_provenance: human
i18n_output_hash: 5b607c2591dd
---

# Docker Image {#docker-image}

SnapOtter एक single Docker image के रूप में उपलब्ध है। इसे अकेले चलाएँ तो यह loopback interface पर एक embedded PostgreSQL 17 और Redis शुरू कर देता है (embedded mode); production के लिए, इसे Compose के साथ अलग PostgreSQL 17 और Redis 8 containers के साथ चलाएँ। app image सभी platforms पर काम करता है।

## Quick start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

कोई `DATABASE_URL` सेट न होने पर, यह embedded mode में चलता है: PostgreSQL और Redis container के भीतर loopback पर शुरू होते हैं, और सारा data `SnapOtter-data` volume के अंतर्गत रहता है। बाहरी services का उपयोग करने के लिए `DATABASE_URL` और `REDIS_URL` सेट करें (जैसा [Compose](#docker-compose) stack करता है)। देखें [Configuration](/hi/guide/configuration#embedded-mode)।

## NVIDIA CUDA acceleration {#nvidia-cuda-acceleration}

image में amd64 पर NVIDIA CUDA समर्थन शामिल है। यदि आपके पास [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) स्थापित के साथ एक NVIDIA GPU है, तो `--gpus all` जोड़ें:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

image runtime पर CUDA का स्वतः पता लगा लेता है। `--gpus all` के बिना, या जब CUDA अनुपलब्ध हो, AI tools CPU पर चलते हैं। दोनों ही स्थिति में वही image।

VA-API, Quick Sync, या OpenCL के माध्यम से Intel/AMD iGPU acceleration फ़िलहाल SnapOtter AI inference के लिए समर्थित नहीं है। `/dev/dri` को container में map करने से render device उजागर हो सकता है, लेकिन जब तक CUDA उपलब्ध न हो, AI runtime फिर भी CPU का ही उपयोग करेगा।

### Benchmarks {#benchmarks}

एक NVIDIA RTX 4070 (12 GB VRAM) पर 572x1024 JPEG portrait के साथ परीक्षित।

#### Warm performance {#warm-performance}

| Tool | CPU | GPU | Speedup |
|------|-----|-----|---------|
| Background removal (u2net) | 2,415ms | 879ms | 2.7x |
| Background removal (isnet) | 2,457ms | 1,137ms | 2.2x |
| Upscale 2x | 350ms | 309ms | 1.1x |
| Upscale 4x | 910ms | 310ms | 2.9x |
| OCR (PaddleOCR) | 137ms | 94ms | 1.5x |
| Face blur | 139ms | 122ms | 1.1x |

#### Cold start (container start के बाद पहला अनुरोध) {#cold-start-first-request-after-container-start}

| Tool | CPU | GPU | Speedup |
|------|-----|-----|---------|
| Background removal | 22,286ms | 4,792ms | 4.7x |
| Upscale 2x | 3,957ms | 2,318ms | 1.7x |
| OCR (PaddleOCR) | 1,469ms | 1,090ms | 1.3x |

### CUDA health check {#cuda-health-check}

पहले AI अनुरोध के बाद, admin health endpoint CUDA GPU status की रिपोर्ट देता है:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

पूर्ण Compose stack में app, PostgreSQL 17, और Redis 8 शामिल हैं। पूरे `docker-compose.yml` के लिए [Deployment](/hi/guide/deployment) देखें। एक न्यूनतम उदाहरण:

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
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
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

Docker Compose के माध्यम से NVIDIA CUDA acceleration के लिए, SnapOtter service में deploy section जोड़ें:

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

| Tag | Description |
|-----|------------|
| `latest` | नवीनतम release |
| `1.11.0` | सटीक version |
| `1.11` | 1.11.x में नवीनतम patch |
| `1` | 1.x में नवीनतम minor |

## Platforms {#platforms}

| Architecture | GPU support | Notes |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | AI tools के लिए पूर्ण CUDA acceleration |
| linux/arm64 | केवल CPU | Raspberry Pi 4/5, Docker Desktop के माध्यम से Apple Silicon |

## पिछले टैग से migration {#migration-from-previous-tags}

यदि आप `:cuda` tag का उपयोग कर रहे थे, तो `:latest` पर स्विच करें और `--gpus all` रखें। वही GPU support, एकीकृत image।

आपका data और settings volumes में संरक्षित रहते हैं।
