---
description: "علامات صورة SnapOtter على Docker، ومقاييس أداء GPU، وتثبيت الإصدارات، ودعم المنصات المتعددة لـ AMD64 وARM64."
i18n_source_hash: 148b3608e11a
i18n_provenance: human
i18n_output_hash: 4ff4ffa4056a
---

# صورة Docker {#docker-image}

تُشحن SnapOtter كصورة Docker واحدة. شغّلها بمفردها فتبدأ تشغيل PostgreSQL 17 وRedis المضمَّنين على واجهة loopback (الوضع المضمَّن)؛ وللإنتاج، شغّلها إلى جانب حاويتَي PostgreSQL 17 وRedis 8 المنفصلتين باستخدام Compose. تعمل صورة التطبيق على جميع المنصات.

## بداية سريعة {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

من دون ضبط `DATABASE_URL`، يعمل هذا في الوضع المضمَّن: يبدأ PostgreSQL وRedis داخل الحاوية على loopback، مع بقاء جميع البيانات ضمن وحدة التخزين `SnapOtter-data`. اضبط `DATABASE_URL` و`REDIS_URL` (كما تفعل حزمة [Compose](#docker-compose)) لاستخدام خدمات خارجية بدلاً من ذلك. راجع [الإعداد](/ar/guide/configuration#embedded-mode).

## تسريع NVIDIA CUDA {#nvidia-cuda-acceleration}

تتضمن الصورة دعم NVIDIA CUDA على amd64. إذا كان لديك معالج رسومات NVIDIA مع [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) مثبَّتًا، أضف `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

تكتشف الصورة CUDA تلقائيًا في وقت التشغيل. من دون `--gpus all`، أو عندما تكون CUDA غير متاحة، تعمل أدوات الذكاء الاصطناعي على وحدة المعالجة المركزية. الصورة نفسها في كلتا الحالتين.

تسريع معالج الرسومات المدمج من Intel/AMD عبر VA-API أو Quick Sync أو OpenCL غير مدعوم لاستدلال الذكاء الاصطناعي في SnapOtter حاليًا. قد يؤدي تعيين `/dev/dri` داخل الحاوية إلى كشف جهاز التصيير، لكن وقت تشغيل الذكاء الاصطناعي سيظل يستخدم وحدة المعالجة المركزية ما لم تكن CUDA متاحة.

### مقاييس الأداء {#benchmarks}

اختُبرت على معالج رسومات NVIDIA RTX 4070 (ذاكرة رسومات سعة 12 غيغابايت) مع صورة شخصية JPEG بأبعاد 572x1024.

#### الأداء بعد الإحماء {#warm-performance}

| الأداة | وحدة المعالجة المركزية | معالج الرسومات | نسبة التسريع |
|------|-----|-----|---------|
| إزالة الخلفية (u2net) | 2,415ms | 879ms | 2.7x |
| إزالة الخلفية (isnet) | 2,457ms | 1,137ms | 2.2x |
| تكبير 2x | 350ms | 309ms | 1.1x |
| تكبير 4x | 910ms | 310ms | 2.9x |
| OCR (PaddleOCR) | 137ms | 94ms | 1.5x |
| تمويه الوجه | 139ms | 122ms | 1.1x |

#### البدء البارد (أول طلب بعد تشغيل الحاوية) {#cold-start-first-request-after-container-start}

| الأداة | وحدة المعالجة المركزية | معالج الرسومات | نسبة التسريع |
|------|-----|-----|---------|
| إزالة الخلفية | 22,286ms | 4,792ms | 4.7x |
| تكبير 2x | 3,957ms | 2,318ms | 1.7x |
| OCR (PaddleOCR) | 1,469ms | 1,090ms | 1.3x |

### فحص سلامة CUDA {#cuda-health-check}

بعد أول طلب للذكاء الاصطناعي، تبلّغ نقطة نهاية سلامة المسؤول عن حالة معالج رسومات CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

تتضمن حزمة Compose الكاملة التطبيق وPostgreSQL 17 وRedis 8. راجع [النشر](/ar/guide/deployment) للحصول على `docker-compose.yml` الكامل. مثال مبسّط:

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

## تثبيت الإصدارات {#version-pinning}

| العلامة | الوصف |
|-----|------------|
| `latest` | أحدث إصدار |
| `1.11.0` | إصدار محدد |
| `1.11` | أحدث تصحيح في 1.11.x |
| `1` | أحدث إصدار فرعي في 1.x |

## المنصات {#platforms}

| البنية | دعم معالج الرسومات | ملاحظات |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | تسريع CUDA كامل لأدوات الذكاء الاصطناعي |
| linux/arm64 | وحدة المعالجة المركزية فقط | Raspberry Pi 4/5، وApple Silicon عبر Docker Desktop |

## الترحيل من العلامات السابقة {#migration-from-previous-tags}

إذا كنت تستخدم العلامة `:cuda`، فانتقل إلى `:latest` واحتفظ بـ `--gpus all`. دعم معالج الرسومات نفسه، وصورة موحّدة.

تُحفظ بياناتك وإعداداتك في وحدات التخزين.
