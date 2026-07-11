---
description: "ตัวแปรสภาพแวดล้อมทั้งหมดของ SnapOtter พร้อมค่าเริ่มต้น กำหนดค่าการยืนยันตัวตน, ที่จัดเก็บ, โมเดล AI, การวิเคราะห์ข้อมูล และอื่น ๆ"
i18n_source_hash: 8e9e9ca2840c
i18n_provenance: human
i18n_output_hash: 891bad80245a
---

# Configuration {#configuration}

การกำหนดค่าทั้งหมดทำผ่านตัวแปรสภาพแวดล้อม ทุกตัวแปรมีค่าเริ่มต้นที่เหมาะสม ดังนั้น SnapOtter จึงทำงานได้ทันทีโดยไม่ต้องตั้งค่าใด ๆ

## Environment variables {#environment-variables}

### Server {#server}

| Variable | Default | Description |
|---|---|---|
| `PORT` | `1349` | พอร์ตที่เซิร์ฟเวอร์รับฟัง |
| `RATE_LIMIT_PER_MIN` | `1000` | จำนวนคำขอสูงสุดต่อนาทีต่อ IP ตั้งเป็น 0 เพื่อปิดการจำกัดอัตรา |
| `CORS_ORIGIN` | (ว่าง) | ต้นทางที่อนุญาตสำหรับ CORS คั่นด้วยเครื่องหมายจุลภาค หรือว่างไว้สำหรับต้นทางเดียวกันเท่านั้น |
| `LOG_LEVEL` | `info` | ระดับความละเอียดของบันทึก หนึ่งใน: `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `TRUST_PROXY` | `true` | เชื่อถือส่วนหัว `X-Forwarded-For` จาก reverse proxy ตั้งเป็น `false` หากไม่ได้อยู่หลัง proxy |

### Authentication {#authentication}

| Variable | Default | Description |
|---|---|---|
| `AUTH_ENABLED` | `false` | ตั้งเป็น `true` เพื่อบังคับให้เข้าสู่ระบบ อิมเมจ Docker มีค่าเริ่มต้นเป็น `true` |
| `DEFAULT_USERNAME` | `admin` | ชื่อผู้ใช้สำหรับบัญชี admin เริ่มต้น ใช้เฉพาะตอนรันครั้งแรก |
| `DEFAULT_PASSWORD` | `admin` | รหัสผ่านสำหรับบัญชี admin เริ่มต้น เปลี่ยนหลังจากเข้าสู่ระบบครั้งแรก |
| `MAX_USERS` | `0` (ไม่จำกัด) | จำนวนบัญชีผู้ใช้ที่ลงทะเบียนสูงสุด ตั้งเป็น 0 สำหรับไม่จำกัด |
| `SESSION_DURATION_HOURS` | `168` | อายุของ session การเข้าสู่ระบบเป็นชั่วโมง (ค่าเริ่มต้นคือ 7 วัน) |
| `SKIP_MUST_CHANGE_PASSWORD` | - | ตั้งเป็นค่าที่ไม่ว่างใด ๆ เพื่อข้ามการแจ้งให้เปลี่ยนรหัสผ่านแบบบังคับตอนเข้าสู่ระบบครั้งแรก |

### Storage {#storage}

| Variable | Default | Description |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` หรือ `s3` S3/MinIO ต้องใช้ใบอนุญาตที่มีฟีเจอร์ s3_storage |
| `DATABASE_URL` | `postgres://snapotter:snapotter@postgres:5432/snapotter` | สตริงการเชื่อมต่อ PostgreSQL |
| `REDIS_URL` | `redis://redis:6379` | สตริงการเชื่อมต่อ Redis (ใช้สำหรับคิวงาน BullMQ) |
| `WORKSPACE_PATH` | `./tmp/workspace` | ไดเรกทอรีสำหรับไฟล์ชั่วคราวระหว่างการประมวลผล ล้างข้อมูลโดยอัตโนมัติ |
| `FILES_STORAGE_PATH` | `./data/files` | ไดเรกทอรีสำหรับไฟล์ผู้ใช้แบบถาวร (ภาพที่อัปโหลด, ผลลัพธ์ที่บันทึก) |

### Embedded mode {#embedded-mode}

รันอิมเมจโดยไม่มี `DATABASE_URL` และไม่มี `REDIS_URL` แล้วมันจะเริ่ม PostgreSQL 17 และ Redis ของตัวเองภายในคอนเทนเนอร์ ผูกกับ loopback โดยข้อมูลทั้งหมดอยู่บนวอลุ่ม `/data` สิ่งนี้ฟื้นฟูประสบการณ์ `docker run` ด้วยคำสั่งเดียวสำหรับการเริ่มต้นอย่างรวดเร็ว, homelab และการอัปเกรดจาก 1.x เป็นเส้นทางเพื่อความสะดวก ไม่ใช่การปรับใช้เพื่อการใช้งานจริง: สำหรับการใช้งานจริง ให้รันสแตก Compose 3 คอนเทนเนอร์พร้อม PostgreSQL และ Redis แยกต่างหาก โหมด embedded ต้องรันคอนเทนเนอร์เป็น root และเข้ากันไม่ได้กับรันไทม์ที่ใช้ UID ตามอำเภอใจ (OpenShift, Kubernetes `runAsNonRoot`) ให้ใช้ Compose ที่นั่น

| Variable | Default | Description |
|---|---|---|
| `EMBEDDED` | `auto` | เปิดใช้อัตโนมัติเมื่อทั้ง `DATABASE_URL` และ `REDIS_URL` ไม่ได้ตั้งค่า ตั้งเป็น `0` เพื่อปิด (แอปจะล้มเหลวอย่างรวดเร็วหากไม่มี `DATABASE_URL`/`REDIS_URL` ภายนอกที่ตั้งค่าไว้ แทนที่จะเริ่มฐานข้อมูลในคอนเทนเนอร์อย่างเงียบ ๆ) |
| `REDIS_MAXMEMORY` | `512mb` | ขีดจำกัดหน่วยความจำสำหรับ Redis แบบฝังในตัว (เฉพาะโหมด embedded) ลดค่านี้บนโฮสต์ที่มีหน่วยความจำจำกัด เช่น Raspberry Pi |

การอัปเกรดจาก 1.x: วาง `snapotter.db` เก่าของคุณไว้ที่ `/data/snapotter.db` ในวอลุ่ม แล้วโหมด embedded จะนำเข้าไปยัง PostgreSQL แบบฝังในตัวเมื่อบูตครั้งแรก การนำเข้าทำงานครั้งเดียว การบูตครั้งต่อ ๆ ไปจะข้ามมัน

หมายเหตุเกี่ยวกับ telemetry: โหมด embedded สืบทอดค่าเริ่มต้นการวิเคราะห์ข้อมูลของอิมเมจเหมือนการกำหนดค่าอื่น ๆ อิมเมจที่เผยแพร่มาพร้อมการวิเคราะห์ข้อมูลที่เปิดอยู่ สร้างด้วย `--build-arg SNAPOTTER_ANALYTICS=off` หรือใช้การเลือกไม่เข้าร่วมของ admin ในแอป เพื่อปิดใช้งาน

### Processing limits {#processing-limits}

| Variable | Default | Description |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `100` | ขนาดไฟล์สูงสุดต่อการอัปโหลดเป็นเมกะไบต์ ตั้งเป็น 0 สำหรับไม่จำกัด |
| `MAX_BATCH_SIZE` | `100` | จำนวนไฟล์สูงสุดในคำขอชุดเดียว ตั้งเป็น 0 สำหรับไม่จำกัด |
| `CONCURRENT_JOBS` | `0` (อัตโนมัติ) | จำนวนงานชุดที่รันแบบขนาน ตั้งเป็น 0 เพื่อตรวจจับอัตโนมัติตามแกน CPU ที่มีอยู่ |
| `MAX_MEGAPIXELS` | `0` (ไม่จำกัด) | ความละเอียดภาพสูงสุดที่อนุญาตเป็นเมกะพิกเซล ตั้งเป็น 0 สำหรับไม่จำกัด |
| `MAX_WORKER_THREADS` | `0` (อัตโนมัติ) | เธรด worker สูงสุดสำหรับการประมวลผลรูปภาพ ตั้งเป็น 0 เพื่อตรวจจับอัตโนมัติตามแกน CPU ที่มีอยู่ |
| `PROCESSING_TIMEOUT_S` | `0` (ไม่มีขีดจำกัด) | เวลาการประมวลผลสูงสุดต่อคำขอเป็นวินาที ตั้งเป็น 0 สำหรับไม่มีการหมดเวลา |
| `MAX_PIPELINE_STEPS` | `20` | จำนวนขั้นตอนสูงสุดในไปป์ไลน์ ตั้งเป็น 0 สำหรับไม่มีขีดจำกัด |
| `MAX_CANVAS_PIXELS` | `0` (ไม่มีขีดจำกัด) | ขนาดแคนวาสสูงสุดเป็นพิกเซลสำหรับภาพเอาต์พุต ตั้งเป็น 0 สำหรับไม่มีขีดจำกัด |
| `MAX_SVG_SIZE_MB` | `0` (ไม่จำกัด) | ขนาดไฟล์ SVG สูงสุดเป็นเมกะไบต์ ตั้งเป็น 0 สำหรับไม่จำกัด |
| `MAX_SPLIT_GRID` | `100` | มิติตารางสูงสุดสำหรับเครื่องมือแยกภาพ |
| `MAX_PDF_PAGES` | `0` (ไม่จำกัด) | จำนวนหน้า PDF สูงสุดสำหรับการแปลง PDF-to-image ตั้งเป็น 0 สำหรับไม่จำกัด |

### Cleanup {#cleanup}

| Variable | Default | Description |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | ระยะเวลาที่เก็บผลลัพธ์การประมวลผลที่ไม่ได้บันทึก (การอัปโหลดดิบและเอาต์พุตเครื่องมือ) ก่อนการลบอัตโนมัติ ไฟล์ที่คุณบันทึกลงคลัง Files อย่างชัดเจนจะไม่ได้รับผลกระทบและคงอยู่จนกว่าคุณจะลบ |
| `CLEANUP_INTERVAL_MINUTES` | `60` | ความถี่ที่งานล้างข้อมูลทำงาน |

### Appearance {#appearance}

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_THEME` | `light` | ธีมเริ่มต้นสำหรับ session ใหม่ `light` หรือ `dark` |
| `DEFAULT_LOCALE` | `en` | ภาษาอินเทอร์เฟซเริ่มต้น |
| `DEFAULT_TOOL_VIEW` | `sidebar` | เลย์เอาต์เครื่องมือเริ่มต้น `sidebar` หรือ `fullscreen` |

### Docker permissions {#docker-permissions}

| Variable | Default | Description |
|---|---|---|
| `PUID` | `999` | รันกระบวนการคอนเทนเนอร์เป็น UID นี้ ตั้งให้ตรงกับผู้ใช้โฮสต์ของคุณสำหรับ bind mount (`id -u`) |
| `PGID` | `999` | รันกระบวนการคอนเทนเนอร์เป็น GID นี้ ตั้งให้ตรงกับกลุ่มโฮสต์ของคุณสำหรับ bind mount (`id -g`) |

## Docker example {#docker-example}

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
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
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
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## Volumes {#volumes}

สแตก Docker Compose ใช้สี่วอลุ่ม:

- `/data` (app) - โมเดล AI, Python venv และไฟล์ผู้ใช้ เมานต์นี้เพื่อเก็บไฟล์ที่อัปโหลดและชุด AI ที่ติดตั้งไว้ข้ามการรีสตาร์ต
- `/tmp/workspace` (app) - ที่จัดเก็บชั่วคราวสำหรับไฟล์ที่กำลังประมวลผล อาจเป็นแบบชั่วคราวได้ แต่การเมานต์ช่วยหลีกเลี่ยงการเติมเลเยอร์ที่เขียนได้ของคอนเทนเนอร์
- `SnapOtter-pgdata` (postgres) - ไดเรกทอรีข้อมูล PostgreSQL เก็บข้อมูลเชิงสัมพันธ์ทั้งหมด (users, settings, pipelines, jobs, audit log) สำรองข้อมูลผ่าน `pg_dump` หรือ snapshot ของวอลุ่ม
- `SnapOtter-redisdata` (redis) - ไฟล์ append-only ของ Redis สำหรับคิวงานที่คงทน
