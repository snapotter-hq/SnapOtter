---
description: "แท็กอิมเมจ Docker ของ SnapOtter, ผลเบนช์มาร์ก GPU, การตรึงเวอร์ชัน และการรองรับหลายแพลตฟอร์มสำหรับ AMD64 และ ARM64"
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: 5213e6170cf8
i18n_hash_version: 2
---

# อิมเมจ Docker {#docker-image}

SnapOtter เผยแพร่เป็นอิมเมจ Docker เพียงอิมเมจเดียว เมื่อรันเดี่ยว ๆ อิมเมจจะเริ่ม PostgreSQL 17 และ Redis แบบฝังในตัวบนอินเทอร์เฟซ loopback (โหมดฝังในตัว) ส่วนการใช้งานจริงควรรันร่วมกับคอนเทนเนอร์ PostgreSQL 17 และ Redis 8 แยกต่างหากผ่าน Compose อิมเมจแอปใช้งานได้บนทุกแพลตฟอร์ม

## เริ่มต้นอย่างรวดเร็ว {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

เมื่อไม่ได้ตั้งค่า `DATABASE_URL` ระบบจะทำงานในโหมดฝังในตัว โดย PostgreSQL และ Redis จะเริ่มภายในคอนเทนเนอร์บน loopback และเก็บข้อมูลทั้งหมดไว้ใต้วอลุ่ม `SnapOtter-data` หากต้องการใช้บริการภายนอกแทน ให้ตั้งค่า `DATABASE_URL` และ `REDIS_URL` (เช่นเดียวกับสแต็ก [Compose](#docker-compose)) ดู [การกำหนดค่า](/th/guide/configuration#embedded-mode)

## การเร่งความเร็วด้วย NVIDIA CUDA {#nvidia-cuda-acceleration}

อิมเมจรองรับ NVIDIA CUDA บน amd64 หากคุณมี GPU ของ NVIDIA และติดตั้ง [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) แล้ว ให้เพิ่ม `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

อิมเมจจะตรวจหา CUDA โดยอัตโนมัติขณะรัน หากไม่มี `--gpus all` หรือไม่มี CUDA เครื่องมือ AI จะทำงานบน CPU เป็นอิมเมจเดียวกันไม่ว่ากรณีใด

การเร่งความเร็วด้วย iGPU ของ Intel/AMD ผ่าน VA-API, Quick Sync หรือ OpenCL ยังไม่รองรับสำหรับการอนุมาน AI ของ SnapOtter ในปัจจุบัน การแมป `/dev/dri` เข้าไปในคอนเทนเนอร์อาจทำให้เห็นอุปกรณ์เรนเดอร์ แต่รันไทม์ AI จะยังใช้ CPU หากไม่มี CUDA

### เบนช์มาร์ก {#benchmarks}

ทดสอบบน NVIDIA RTX 4070 (VRAM 12 GB) ด้วยภาพบุคคลแนวตั้ง JPEG ขนาด 572x1024

#### ประสิทธิภาพขณะอุ่นเครื่องแล้ว {#warm-performance}

| เครื่องมือ | CPU | GPU | ความเร็วที่เพิ่มขึ้น |
|------|-----|-----|---------|
| ลบพื้นหลัง (u2net) | 2,415ms | 879ms | 2.7x |
| ลบพื้นหลัง (isnet) | 2,457ms | 1,137ms | 2.2x |
| ขยายภาพ 2x | 350ms | 309ms | 1.1x |
| ขยายภาพ 4x | 910ms | 310ms | 2.9x |
| เบลอใบหน้า | 139ms | 122ms | 1.1x |

#### เริ่มต้นแบบเย็น (คำขอแรกหลังคอนเทนเนอร์เริ่มทำงาน) {#cold-start-first-request-after-container-start}

| เครื่องมือ | CPU | GPU | ความเร็วที่เพิ่มขึ้น |
|------|-----|-----|---------|
| ลบพื้นหลัง | 22,286ms | 4,792ms | 4.7x |
| ขยายภาพ 2x | 3,957ms | 2,318ms | 1.7x |

OCR ไม่รวมอยู่ในการเปรียบเทียบ CUDA ทั้งระดับ Tesseract ในตัวและระดับ RapidOCR/ONNX แบบเสริมใช้ CPU แม้คอนเทนเนอร์จะเข้าถึง GPU ของ NVIDIA ได้ก็ตาม

### การตรวจสอบสถานะ CUDA {#cuda-health-check}

หลังจากคำขอ AI ครั้งแรก เอ็นด์พอยต์ตรวจสอบสถานะสำหรับผู้ดูแลระบบจะรายงานสถานะ CUDA GPU:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

สแต็ก Compose แบบเต็มประกอบด้วยแอป PostgreSQL 17 และ Redis 8 ดู [การติดตั้งใช้งาน](/th/guide/deployment) สำหรับ `docker-compose.yml` ฉบับสมบูรณ์ ตัวอย่างขั้นต่ำ:

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

หากต้องการเร่งความเร็วด้วย NVIDIA CUDA ผ่าน Docker Compose ให้เพิ่มส่วน deploy ลงในบริการ SnapOtter:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## การตรึงเวอร์ชัน {#version-pinning}

| แท็ก | คำอธิบาย |
|-----|------------|
| `latest` | รุ่นล่าสุด |
| `2.2.0` | เวอร์ชันที่ระบุแน่นอน |
| `2.2` | แพตช์ล่าสุดใน 2.2.x |
| `2` | ไมเนอร์ล่าสุดใน 2.x |

## แพลตฟอร์ม {#platforms}

| สถาปัตยกรรม | การรองรับ GPU | หมายเหตุ |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | เร่งความเร็วด้วย CUDA เต็มรูปแบบสำหรับเครื่องมือ AI |
| linux/arm64 | CPU เท่านั้น | Raspberry Pi 4/5, Apple Silicon ผ่าน Docker Desktop |

## การย้ายจากแท็กเดิม {#migration-from-previous-tags}

หากคุณใช้แท็ก `:cuda` อยู่ ให้เปลี่ยนเป็น `:latest` และคง `--gpus all` ไว้ รองรับ GPU เหมือนเดิมและใช้อิมเมจเดียวกัน

ข้อมูลและการตั้งค่าของคุณยังคงอยู่ในวอลุ่ม
