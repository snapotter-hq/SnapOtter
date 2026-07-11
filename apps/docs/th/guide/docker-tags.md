---
description: "แท็กของ Docker image สำหรับ SnapOtter, การเปรียบเทียบประสิทธิภาพ GPU, การล็อกเวอร์ชัน และการรองรับหลายแพลตฟอร์มสำหรับ AMD64 และ ARM64"
i18n_source_hash: 148b3608e11a
i18n_provenance: human
i18n_output_hash: 6df1f68453ec
---

# Docker Image {#docker-image}

SnapOtter เผยแพร่เป็น Docker image เพียงตัวเดียว รันมันเดี่ยว ๆ แล้วมันจะเริ่ม PostgreSQL 17 และ Redis แบบฝังตัวบนอินเทอร์เฟซ loopback (โหมดฝังตัว) สำหรับการใช้งานจริง ให้รันควบคู่ไปกับคอนเทนเนอร์ PostgreSQL 17 และ Redis 8 แยกต่างหากด้วย Compose แอป image นี้ทำงานได้บนทุกแพลตฟอร์ม

## เริ่มต้นอย่างรวดเร็ว {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

เมื่อไม่ได้ตั้งค่า `DATABASE_URL` ตัวนี้จะรันในโหมดฝังตัว: PostgreSQL และ Redis จะเริ่มทำงานภายในคอนเทนเนอร์บน loopback โดยเก็บข้อมูลทั้งหมดไว้ใต้ volume `SnapOtter-data` ตั้งค่า `DATABASE_URL` และ `REDIS_URL` (อย่างที่สแตก [Compose](#docker-compose) ทำ) เพื่อใช้บริการภายนอกแทน ดู [การกำหนดค่า](/th/guide/configuration#embedded-mode)

## การเร่งความเร็วด้วย NVIDIA CUDA {#nvidia-cuda-acceleration}

image นี้มีการรองรับ NVIDIA CUDA บน amd64 หากคุณมี NVIDIA GPU พร้อมติดตั้ง [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) แล้ว ให้เพิ่ม `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

image จะตรวจจับ CUDA โดยอัตโนมัติในขณะรัน หากไม่มี `--gpus all` หรือเมื่อ CUDA ไม่พร้อมใช้งาน เครื่องมือ AI จะรันบน CPU ใช้ image เดียวกันได้ทั้งสองแบบ

การเร่งความเร็วด้วย iGPU ของ Intel/AMD ผ่าน VA-API, Quick Sync หรือ OpenCL ยังไม่รองรับสำหรับการอนุมาน AI ของ SnapOtter ในปัจจุบัน การแมป `/dev/dri` เข้าไปในคอนเทนเนอร์อาจเปิดเผยอุปกรณ์ render ได้ แต่รันไทม์ AI จะยังคงใช้ CPU เว้นแต่จะมี CUDA พร้อมใช้งาน

### การเปรียบเทียบประสิทธิภาพ {#benchmarks}

ทดสอบบน NVIDIA RTX 4070 (VRAM 12 GB) ด้วยภาพบุคคล JPEG ขนาด 572x1024

#### ประสิทธิภาพแบบ warm {#warm-performance}

| เครื่องมือ | CPU | GPU | เร็วขึ้น |
|------|-----|-----|---------|
| การลบพื้นหลัง (u2net) | 2,415ms | 879ms | 2.7x |
| การลบพื้นหลัง (isnet) | 2,457ms | 1,137ms | 2.2x |
| ขยายภาพ 2x | 350ms | 309ms | 1.1x |
| ขยายภาพ 4x | 910ms | 310ms | 2.9x |
| OCR (PaddleOCR) | 137ms | 94ms | 1.5x |
| เบลอใบหน้า | 139ms | 122ms | 1.1x |

#### Cold start (คำขอแรกหลังเริ่มคอนเทนเนอร์) {#cold-start-first-request-after-container-start}

| เครื่องมือ | CPU | GPU | เร็วขึ้น |
|------|-----|-----|---------|
| การลบพื้นหลัง | 22,286ms | 4,792ms | 4.7x |
| ขยายภาพ 2x | 3,957ms | 2,318ms | 1.7x |
| OCR (PaddleOCR) | 1,469ms | 1,090ms | 1.3x |

### การตรวจสอบสถานะ CUDA {#cuda-health-check}

หลังจากคำขอ AI ครั้งแรก endpoint สำหรับตรวจสอบสถานะของผู้ดูแลระบบจะรายงานสถานะ CUDA GPU:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

สแตก Compose แบบเต็มประกอบด้วยแอป, PostgreSQL 17 และ Redis 8 ดู [การนำไปใช้งาน](/th/guide/deployment) สำหรับ `docker-compose.yml` ฉบับสมบูรณ์ ตัวอย่างขั้นต่ำ:

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

สำหรับการเร่งความเร็วด้วย NVIDIA CUDA ผ่าน Docker Compose ให้เพิ่มส่วน deploy เข้าไปในบริการ SnapOtter:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## การล็อกเวอร์ชัน {#version-pinning}

| แท็ก | คำอธิบาย |
|-----|------------|
| `latest` | รุ่นล่าสุด |
| `1.11.0` | เวอร์ชันที่ระบุแน่นอน |
| `1.11` | patch ล่าสุดใน 1.11.x |
| `1` | minor ล่าสุดใน 1.x |

## แพลตฟอร์ม {#platforms}

| สถาปัตยกรรม | การรองรับ GPU | หมายเหตุ |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | การเร่งความเร็ว CUDA เต็มรูปแบบสำหรับเครื่องมือ AI |
| linux/arm64 | CPU เท่านั้น | Raspberry Pi 4/5, Apple Silicon ผ่าน Docker Desktop |

## การย้ายจากแท็กก่อนหน้า {#migration-from-previous-tags}

หากคุณเคยใช้แท็ก `:cuda` ให้เปลี่ยนไปใช้ `:latest` และคง `--gpus all` ไว้ การรองรับ GPU เหมือนเดิม เป็น image ที่รวมเป็นหนึ่งเดียว

ข้อมูลและการตั้งค่าของคุณจะถูกเก็บรักษาไว้ใน volume
