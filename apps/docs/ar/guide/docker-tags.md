---
description: "وسوم صور Docker لـ SnapOtter، ومقاييس أداء GPU، وتثبيت الإصدارات، ودعم المنصات المتعددة لمعماريتي AMD64 وARM64."
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: d58f3c7623fa
i18n_hash_version: 2
---

# وسوم صورة Docker {#docker-image}

يُشحن SnapOtter كصورة Docker واحدة. عند تشغيلها بمفردها تبدأ PostgreSQL 17 وRedis مضمَّنتين على واجهة loopback (الوضع المضمَّن)، أما في بيئة الإنتاج فشغّلها إلى جانب حاويتين منفصلتين لـ PostgreSQL 17 وRedis 8 باستخدام Compose. تعمل صورة التطبيق على جميع المنصات.

## البدء السريع {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

عند عدم ضبط `DATABASE_URL`، يعمل هذا في الوضع المضمَّن: تبدأ PostgreSQL وRedis داخل الحاوية على loopback، مع وجود جميع البيانات ضمن وحدة التخزين `SnapOtter-data`. اضبط `DATABASE_URL` و`REDIS_URL` (كما تفعل حزمة [Compose](#docker-compose)) لاستخدام خدمات خارجية بدلاً من ذلك. راجع [الإعدادات](/ar/guide/configuration#embedded-mode).

## تسريع NVIDIA CUDA {#nvidia-cuda-acceleration}

تتضمن الصورة دعم NVIDIA CUDA على amd64. إذا كان لديك وحدة معالجة رسومية من NVIDIA مع تثبيت [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)، فأضف `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

تكتشف الصورة CUDA تلقائياً أثناء التشغيل. بدون `--gpus all`، أو عند عدم توفر CUDA، تعمل أدوات الذكاء الاصطناعي على وحدة المعالجة المركزية. الصورة نفسها في الحالتين.

تسريع وحدات iGPU من Intel/AMD عبر VA-API أو Quick Sync أو OpenCL غير مدعوم حالياً في استدلال الذكاء الاصطناعي في SnapOtter. قد يؤدي ربط `/dev/dri` داخل الحاوية إلى إتاحة جهاز العرض، لكن بيئة تشغيل الذكاء الاصطناعي ستظل تستخدم وحدة المعالجة المركزية ما لم يتوفر CUDA.

### مقاييس الأداء {#benchmarks}

أُجريت الاختبارات على NVIDIA RTX 4070 (ذاكرة VRAM بسعة 12 GB) مع صورة JPEG بورتريه بأبعاد 572x1024.

#### الأداء بعد التسخين {#warm-performance}

| الأداة | CPU | GPU | التسريع |
|------|-----|-----|---------|
| إزالة الخلفية (u2net) | 2,415ms | 879ms | 2.7x |
| إزالة الخلفية (isnet) | 2,457ms | 1,137ms | 2.2x |
| تكبير 2x | 350ms | 309ms | 1.1x |
| تكبير 4x | 910ms | 310ms | 2.9x |
| تمويه الوجوه | 139ms | 122ms | 1.1x |

#### البدء البارد (أول طلب بعد بدء الحاوية) {#cold-start-first-request-after-container-start}

| الأداة | CPU | GPU | التسريع |
|------|-----|-----|---------|
| إزالة الخلفية | 22,286ms | 4,792ms | 4.7x |
| تكبير 2x | 3,957ms | 2,318ms | 1.7x |

لا يشمل مقارنة CUDA التعرف الضوئي على الحروف (OCR). تستخدم كل من طبقة Tesseract المدمجة وطبقات RapidOCR/ONNX الاختيارية وحدة المعالجة المركزية، بما في ذلك عندما تملك الحاوية صلاحية الوصول إلى GPU من NVIDIA.

### فحص سلامة CUDA {#cuda-health-check}

بعد أول طلب للذكاء الاصطناعي، تُبلغ نقطة نهاية الصحة الخاصة بالمسؤول عن حالة CUDA GPU:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

تتضمن حزمة Compose الكاملة التطبيق وPostgreSQL 17 وRedis 8. راجع [النشر](/ar/guide/deployment) للاطلاع على `docker-compose.yml` الكامل. مثال مبسط:

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

لتسريع NVIDIA CUDA عبر Docker Compose، أضف قسم deploy إلى خدمة SnapOtter:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## تثبيت الإصدار {#version-pinning}

| الوسم | الوصف |
|-----|------------|
| `latest` | أحدث إصدار |
| `2.2.0` | إصدار محدد بدقة |
| `2.2` | أحدث تصحيح في 2.2.x |
| `2` | أحدث إصدار فرعي في 2.x |

## المنصات {#platforms}

| المعمارية | دعم GPU | ملاحظات |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | تسريع CUDA كامل لأدوات الذكاء الاصطناعي |
| linux/arm64 | CPU فقط | Raspberry Pi 4/5، وApple Silicon عبر Docker Desktop |

## الانتقال من الوسوم السابقة {#migration-from-previous-tags}

إذا كنت تستخدم الوسم `:cuda`، فانتقل إلى `:latest` واحتفظ بـ `--gpus all`. الدعم نفسه لـ GPU، في صورة موحدة.

تُحفظ بياناتك وإعداداتك في وحدات التخزين.