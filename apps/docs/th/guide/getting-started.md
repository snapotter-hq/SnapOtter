---
description: "ติดตั้ง SnapOtter ด้วย Docker ในคำสั่งเดียว รวมถึงการตั้งค่า Docker Compose, การ build จากซอร์ส และภาพรวมฟีเจอร์ทั้งหมด"
i18n_source_hash: d2366a2e051c
i18n_provenance: human
i18n_output_hash: 2408ec12f96b
---

# เริ่มต้นใช้งาน {#getting-started}

::: tip ลองก่อนติดตั้ง
สำรวจ UI เต็มรูปแบบได้ที่ [demo.snapotter.com](https://demo.snapotter.com) โดยไม่ต้องสมัครสมาชิกหรือติดตั้ง
:::

## เริ่มต้นอย่างรวดเร็ว {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

คอนเทนเนอร์เดียวนี้รันทุกอย่างที่ต้องการ: เมื่อไม่ได้ตั้งค่า `DATABASE_URL` มันจะเริ่ม PostgreSQL และ Redis ของตัวเองบนอินเทอร์เฟซ loopback (โหมดฝังตัว) และเก็บข้อมูลทั้งหมดไว้ใน volume `SnapOtter-data` นี่คือวิธีที่เร็วที่สุดในการลองใช้ SnapOtter หรือ self-host บน homelab สำหรับการใช้งานจริง ให้รันสแตก [Docker Compose](#docker-compose) ด้านล่าง ซึ่งจะแยก PostgreSQL และ Redis ไว้ในคอนเทนเนอร์ของตัวเอง โหมดฝังตัวรันในฐานะ root (ค่าเริ่มต้น) และปิดตัวลงอัตโนมัติทันทีที่คุณตั้งค่า `DATABASE_URL`

คุณจะถูกขอให้เปลี่ยนรหัสผ่านในการเข้าสู่ระบบครั้งแรก

::: tip การวิเคราะห์ผลิตภัณฑ์แบบไม่ระบุตัวตน
SnapOtter มีการวิเคราะห์ผลิตภัณฑ์แบบไม่ระบุตัวตนโดยค่าเริ่มต้น หากต้องการปิด ให้เปิด **Settings → System → Privacy** แล้วปิด **Anonymous Product Analytics** มันจะหยุดทันทีสำหรับทั้ง instance

สำหรับรายละเอียดเกี่ยวกับสิ่งที่ถูกเก็บรวบรวม ดู [ข้อมูลที่ SnapOtter เก็บรวบรวม](/th/guide/telemetry)
:::

::: tip การเร่งความเร็วด้วย NVIDIA CUDA
เพิ่ม `--gpus all` สำหรับการลบพื้นหลัง, การขยายภาพ, OCR, การปรับปรุงใบหน้า และการฟื้นฟูที่เร่งความเร็วด้วย NVIDIA CUDA:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

ต้องมี [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) จะ fallback ไปใช้ CPU โดยอัตโนมัติเมื่อ CUDA ไม่พร้อมใช้งาน การเร่งความเร็วด้วย iGPU ของ Intel/AMD ผ่าน VA-API, Quick Sync หรือ OpenCL ยังไม่รองรับสำหรับการอนุมาน AI ในปัจจุบัน ดู [Docker Tags](/th/guide/docker-tags) สำหรับการเปรียบเทียบประสิทธิภาพ
:::

::: details มีบน GHCR ด้วย
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

ทั้งสอง registry เผยแพร่ image เดียวกันในทุกรุ่น
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

ดู [การกำหนดค่า](/th/guide/configuration) สำหรับตัวแปรสภาพแวดล้อมทั้งหมด

## Build จากซอร์ส {#build-from-source}

**สิ่งที่ต้องมีก่อน:** Node.js 22+, pnpm 9+, Docker (สำหรับ Postgres + Redis), Python 3.10+ (สำหรับฟีเจอร์ AI), Git

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## สิ่งที่คุณทำได้ {#what-you-can-do}

### การประมวลผลไฟล์ (241 เครื่องมือ) {#file-processing-241-tools}

| รูปแบบ | จำนวน | ตัวอย่างเครื่องมือ |
|----------|-------|---------------|
| **Image** | 105 | Resize, Crop, Compress, Convert, Remove Background, Upscale, OCR, Watermark, Collage, Colorize, GIF Tools, พรีเซ็ตรูปแบบ |
| **Video** | 57 | Trim, Crop, Compress, Convert, Merge, Extract Audio, Auto Subtitles, Video to GIF, Resize, Stabilize, พรีเซ็ตรูปแบบ |
| **Audio** | 27 | Trim, Merge, Convert, Normalize, Noise Reduction, Transcribe, Pitch Shift, Fade, Ringtone Maker, พรีเซ็ตรูปแบบ |
| **PDF / Document** | 42 | Merge, Split, Compress, OCR, Watermark, Redact, Word to PDF, Excel to PDF, Rotate, Protect, Repair |
| **Files** | 10 | CSV to JSON, JSON to XML, Merge CSVs, Split CSV, Create ZIP, Extract ZIP, Chart Maker, YAML/JSON |

### Pipelines {#pipelines}

เชื่อมเครื่องมือเข้าด้วยกันเป็นเวิร์กโฟลว์หลายขั้นตอนและนำไปใช้กับภาพเดียวหรือทั้ง batch:

1. เปิด **Pipelines** ในแถบด้านข้าง
2. เพิ่มขั้นตอน (เครื่องมือใดก็ได้ การตั้งค่าใดก็ได้)
3. รันกับไฟล์เดียว หรือทั้ง batch พร้อมกัน
4. บันทึก pipeline ไว้ใช้ซ้ำในภายหลัง

Pipeline อนุญาต 20 ขั้นตอนโดยค่าเริ่มต้น ตั้งค่า `MAX_PIPELINE_STEPS=0` เพื่อทำให้ขีดจำกัดไม่จำกัด

### คลังไฟล์ {#file-library}

ทุกไฟล์ที่คุณประมวลผลสามารถบันทึกลงคลัง **Files** ของคุณได้ SnapOtter ติดตามประวัติเวอร์ชันทั้งหมดเพื่อให้คุณสามารถตามรอยทุกขั้นตอนการประมวลผลตั้งแต่ไฟล์ต้นฉบับที่อัปโหลดไปจนถึงผลลัพธ์สุดท้าย

การบันทึกเป็นแบบชัดเจน: ผลลัพธ์ที่คุณบันทึกลงคลังจะถูกเก็บไว้จนกว่าคุณจะลบ ขณะที่ผลลัพธ์ที่คุณประมวลผลและปล่อยทิ้งไว้โดยไม่บันทึกจะถูกล้างโดยอัตโนมัติหลังจาก 72 ชั่วโมง (กำหนดค่าได้ผ่าน `FILE_MAX_AGE_HOURS`)

### REST API และ API Keys {#rest-api-api-keys}

ทุกเครื่องมือเข้าถึงได้ผ่าน HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

สร้าง API key ได้ที่ **Settings → API Keys** ดู [เอกสารอ้างอิง REST API](/th/api/rest) สำหรับ endpoint ทั้งหมด หรือเยี่ยมชม [http://localhost:1349/api/docs](http://localhost:1349/api/docs) สำหรับเอกสารอ้างอิงแบบโต้ตอบ

### หลายผู้ใช้และทีม {#multi-user-teams}

เปิดใช้งานผู้ใช้หลายคนพร้อมการควบคุมการเข้าถึงตามบทบาท:

- **Admin**: เข้าถึงเต็มรูปแบบ จัดการผู้ใช้ ทีม การตั้งค่า ไฟล์/pipeline/API key ทั้งหมด
- **User**: ใช้เครื่องมือ จัดการไฟล์/pipeline/API key ของตนเอง

สร้างทีมได้ที่ **Settings → Teams** เพื่อจัดกลุ่มผู้ใช้

ตั้งค่า `AUTH_ENABLED=true` (หรือ `false` สำหรับผู้ใช้เดี่ยว/ใช้เองโดยไม่ต้องเข้าสู่ระบบ)
