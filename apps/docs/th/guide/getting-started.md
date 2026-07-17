---
description: "ติดตั้ง SnapOtter ด้วย Docker ในคำสั่งเดียว รวมถึงการตั้งค่า Docker Compose การ build จากซอร์ส และภาพรวมฟีเจอร์ทั้งหมด"
i18n_output_hash: 5353dda97d38
i18n_source_hash: 68bf7f60b68d
i18n_provenance: human
---

# Getting Started {#getting-started}

::: tip ลองก่อนติดตั้ง
สำรวจ UI แบบเต็มที่ [demo.snapotter.com](https://demo.snapotter.com) โดยไม่ต้องสมัครหรือติดตั้ง
:::

## Quick Start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

คอนเทนเนอร์เดียวนี้รันทุกอย่างที่จำเป็น: เมื่อไม่ได้ตั้งค่า `DATABASE_URL` มันจะเริ่ม PostgreSQL และ Redis ของตัวเองบนอินเทอร์เฟซ loopback (โหมด embedded) และเก็บข้อมูลทั้งหมดไว้ในวอลุ่ม `SnapOtter-data` นี่คือวิธีที่เร็วที่สุดในการลอง SnapOtter หรือ self-host บน homelab สำหรับโปรดักชัน ให้รันสแตก [Docker Compose](#docker-compose) ด้านล่าง ซึ่งเก็บ PostgreSQL และ Redis ไว้ในคอนเทนเนอร์ของตัวเอง โหมด embedded รันเป็น root (ค่าเริ่มต้น) และปิดโดยอัตโนมัติทันทีที่คุณตั้งค่า `DATABASE_URL`

หากกำลังติดตั้งบน Raspberry Pi แล็ปท็อปเครื่องเก่า หรือ VPS ขนาดเล็ก ดู [Low-Resource Setups](/th/guide/low-resource) สำหรับคู่มือทีละขั้นที่ปรับจูนมาแล้ว และสิ่งที่ควรคาดหวังจากฮาร์ดแวร์ที่จำกัด

คุณจะถูกขอให้เปลี่ยนรหัสผ่านตอนล็อกอินครั้งแรก

::: tip การวิเคราะห์ผลิตภัณฑ์แบบไม่ระบุตัวตน
SnapOtter มีการวิเคราะห์ผลิตภัณฑ์แบบไม่ระบุตัวตนโดยค่าเริ่มต้น หากต้องการปิด ให้เปิด **Settings → System → Privacy** แล้วปิด **Anonymous Product Analytics** มันจะหยุดทันทีสำหรับทั้งอินสแตนซ์

คุณยังสามารถตั้งค่าตัวแปรสภาพแวดล้อม `SNAPOTTER_TELEMETRY=0` (`false` และ `off` ก็ใช้ได้) เพื่อปิด telemetry ทั้งหมดสำหรับอินสแตนซ์โดยไม่ต้อง build ใหม่

การตรวจสอบข้อผิดพลาดขับเคลื่อนโดย [Sentry](https://sentry.io) ซึ่งสนับสนุน SnapOtter ผ่านโปรแกรมโอเพนซอร์สของตน

สำหรับรายละเอียดเกี่ยวกับสิ่งที่ถูกเก็บ ดู [สิ่งที่ SnapOtter เก็บ](/th/guide/telemetry)
:::

::: tip การเร่งความเร็วด้วย NVIDIA CUDA
เพิ่ม `--gpus all` สำหรับการลบพื้นหลังที่เร่งด้วย NVIDIA CUDA การลดขนาด การปรับปรุงใบหน้า และการฟื้นฟู OCR ยังคงใช้ CPU และทำงานในอิมเมจเดียวกันโดยมีหรือไม่มีการเข้าถึง GPU:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

ต้องใช้ [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) จะสำรองไปใช้ CPU โดยอัตโนมัติเมื่อไม่มี CUDA ปัจจุบันยังไม่รองรับการเร่งความเร็วด้วย iGPU ของ Intel/AMD ผ่าน VA-API, Quick Sync หรือ OpenCL สำหรับการอนุมาน AI ดู [Docker Tags](/th/guide/docker-tags) สำหรับผลการทดสอบประสิทธิภาพ
:::

::: details มีบน GHCR ด้วย
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

ทั้งสอง registry เผยแพร่อิมเมจเดียวกันในทุกรีลีส
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

ดู [Configuration](/th/guide/configuration) สำหรับตัวแปรสภาพแวดล้อมทั้งหมด

## Build from Source {#build-from-source}

**ข้อกำหนดเบื้องต้น:** Node.js 22+, pnpm 9+, Docker (สำหรับ Postgres + Redis), Python 3.10+ (สำหรับฟีเจอร์ AI), Git

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## What You Can Do {#what-you-can-do}

### File Processing (200+ Tools) {#file-processing-200-tools}

| โมดัลลิตี | จำนวน | เครื่องมือตัวอย่าง |
|----------|-------|---------------|
| **รูปภาพ** | 105 | ปรับขนาด, ครอป, บีบอัด, แปลง, ลบพื้นหลัง, ขยายภาพ, OCR, ลายน้ำ, คอลลาจ, ลงสี, เครื่องมือ GIF, พรีเซ็ตรูปแบบ |
| **วิดีโอ** | 57 | ตัด, ครอป, บีบอัด, แปลง, รวม, แยกเสียง, คำบรรยายอัตโนมัติ, วิดีโอเป็น GIF, ปรับขนาด, ทำให้ภาพนิ่ง, พรีเซ็ตรูปแบบ |
| **เสียง** | 27 | ตัด, รวม, แปลง, นอร์มัลไลซ์, ลดสัญญาณรบกวน, ถอดเสียง, ปรับระดับเสียง, เฟด, สร้างริงโทน, พรีเซ็ตรูปแบบ |
| **PDF / เอกสาร** | 42 | รวม, แยก, บีบอัด, OCR, ลายน้ำ, ปกปิดข้อมูล, Word เป็น PDF, Excel เป็น PDF, หมุน, ป้องกัน, ซ่อมแซม |
| **ไฟล์** | 10 | CSV เป็น JSON, JSON เป็น XML, รวม CSV, แยก CSV, สร้าง ZIP, แตก ZIP, สร้างแผนภูมิ, YAML/JSON |

### Pipelines {#pipelines}

ร้อยเครื่องมือเข้าเป็นเวิร์กโฟลว์หลายขั้นตอน แล้วนำไปใช้กับรูปภาพเดียวหรือทั้งชุด:

1. เปิด **Pipelines** ในแถบด้านข้าง
2. เพิ่มขั้นตอน (เครื่องมือใดก็ได้ การตั้งค่าใดก็ได้)
3. รันบนไฟล์เดียว หรือทั้งชุดในคราวเดียว
4. บันทึกไปป์ไลน์ไว้ใช้ซ้ำภายหลัง

ไปป์ไลน์อนุญาต 20 ขั้นตอนโดยค่าเริ่มต้น ตั้งค่า `MAX_PIPELINE_STEPS=0` เพื่อทำให้ขีดจำกัดไม่จำกัด

### File Library {#file-library}

ทุกไฟล์ที่คุณประมวลผลสามารถบันทึกไปยังไลบรารี **Files** ของคุณได้ SnapOtter ติดตามประวัติเวอร์ชันทั้งหมด เพื่อให้คุณย้อนรอยทุกขั้นตอนการประมวลผลตั้งแต่การอัปโหลดต้นฉบับจนถึงเอาต์พุตสุดท้าย

การบันทึกเป็นการกระทำที่ชัดเจน: ผลลัพธ์ที่คุณบันทึกไปยังไลบรารีจะถูกเก็บไว้จนกว่าคุณจะลบ ในขณะที่ผลลัพธ์ที่คุณประมวลผลและปล่อยไว้โดยไม่บันทึกจะถูกล้างโดยอัตโนมัติหลังจาก 72 ชั่วโมง (กำหนดค่าได้ผ่าน `FILE_MAX_AGE_HOURS`)

### REST API & API Keys {#rest-api-api-keys}

ทุกเครื่องมือเข้าถึงได้ผ่าน HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

สร้าง API key ภายใต้ **Settings → API Keys** ดู [REST API reference](/th/api/rest) สำหรับ endpoint ทั้งหมด หรือไปที่ [http://localhost:1349/api/docs](http://localhost:1349/api/docs) สำหรับเอกสารอ้างอิงแบบโต้ตอบ

### Multi-User & Teams {#multi-user-teams}

เปิดใช้ผู้ใช้หลายคนด้วยการควบคุมการเข้าถึงตามบทบาท:

- **แอดมิน**: เข้าถึงเต็มรูปแบบ จัดการผู้ใช้, ทีม, การตั้งค่า, ไฟล์/ไปป์ไลน์/API key ทั้งหมด
- **ผู้ใช้**: ใช้เครื่องมือ, จัดการไฟล์/ไปป์ไลน์/API key ของตัวเอง

สร้างทีมภายใต้ **Settings → Teams** เพื่อจัดกลุ่มผู้ใช้

ตั้งค่า `AUTH_ENABLED=true` (หรือ `false` สำหรับการใช้งานคนเดียว/ใช้เองโดยไม่ต้องล็อกอิน)
