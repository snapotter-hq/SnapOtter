---
description: "ติดตั้ง SnapOtter ด้วย Docker ในคำสั่งเดียว รวมถึงการตั้งค่า Docker Compose การ build จากซอร์ส และภาพรวมฟีเจอร์ทั้งหมด"
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: 8e92205fb44d
i18n_hash_version: 2
---

# Getting Started {#getting-started}

::: tip ลองก่อนติดตั้ง
สำรวจ UI แบบเต็มที่ [demo.snapotter.com](https://demo.snapotter.com) โดยไม่ต้องสมัครหรือติดตั้ง
:::

## Quick Start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

คอนเทนเนอร์เดียวนี้รันทุกสิ่งที่ต้องการ: โดยไม่ต้องตั้งค่า `DATABASE_URL` คอนเทนเนอร์จะเริ่มต้น PostgreSQL และ Redis ของตัวเองบนอินเทอร์เฟซแบบย้อนกลับ (โหมดฝังตัว) และเก็บข้อมูลทั้งหมดไว้ในโวลุ่ม `SnapOtter-data` นี่เป็นวิธีที่เร็วที่สุดในการลองใช้ SnapOtter หรือโฮสต์เองบนโฮมแล็บ สำหรับการใช้งานจริง ให้ใช้ [canonical Docker Compose stack](#docker-compose) ซึ่งจะเก็บ PostgreSQL และ Redis ไว้ในคอนเทนเนอร์ของตัวเอง โหมดฝังตัวจะทำงานในฐานะรูท (ค่าเริ่มต้น) และปิดโดยอัตโนมัติทันทีที่คุณตั้งค่า `DATABASE_URL`

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

ต้องใช้ [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) ถอยกลับไปที่ CPU โดยอัตโนมัติเมื่อ CUDA ไม่พร้อมใช้งาน การเร่งความเร็ว Intel/AMD iGPU ผ่าน VA-API, Quick Sync หรือ OpenCL ไม่รองรับการอนุมาน AI ในปัจจุบัน ดู [แท็กนักเทียบท่า](/th/guide/docker-tags) สำหรับการวัดประสิทธิภาพ หากเครื่องมือ AI ทำงานบน CPU แม้ว่าจะเป็น `--gpus all` โปรดดู [ตรวจสอบการเร่งความเร็ว GPU](/th/guide/deployment#verify-gpu-acceleration)
:::

::: details มีบน GHCR ด้วย
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

ทั้งสอง registry เผยแพร่อิมเมจเดียวกันในทุกรีลีส
:::

## นักเทียบท่าเขียน {#docker-compose}

ใช้ไฟล์ที่ใช้งานจริงที่ได้รับการดูแลและทดสอบกับแต่ละรีลีส แทนที่จะคัดลอกตัวอย่างการเขียนแบบย่อจากหน้านี้:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.2.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

Canonical [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.2.0/docker/docker-compose.yml) ประกอบด้วยรันไทม์วอลุ่มทั้งสี่ การตรวจสอบสภาพ ขีดจำกัดทรัพยากร การกำหนดค่า Redis ที่คงทน ฐานข้อมูล/อิมเมจแคชที่ปักหมุดไว้ และการทำให้คอนเทนเนอร์ปัจจุบันแข็งตัว เปลี่ยนรหัสผ่านผู้ดูแลระบบเริ่มต้นทันทีหลังจากเข้าสู่ระบบครั้งแรก สำหรับการปรับใช้ที่ทำซ้ำได้ ให้ปักหมุดอิมเมจแอปพลิเคชัน SnapOtter ไว้ที่แท็ก release หรือแยกย่อยที่คุณตรวจสอบแล้ว แทนที่จะติดตาม `latest`

ดู [การกำหนดค่า](/th/guide/configuration) สำหรับตัวแปรสภาพแวดล้อมทั้งหมด และ [ความปลอดภัยและการป้องกัน](/th/guide/security) สำหรับความลับ นโยบายเครือข่าย และคำแนะนำในการสำรองข้อมูล

## Build from Source {#build-from-source}

**ข้อกำหนดเบื้องต้น:** Node.js 22.22+, pnpm 9+, Docker (สำหรับ Postgres + Redis), Python 3.11+ (สำหรับฟีเจอร์ AI), Git

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1351](http://localhost:1351)
- Backend: [http://localhost:13490](http://localhost:13490)

## What You Can Do {#what-you-can-do}

### File Processing (200+ Tools) {#file-processing-200-tools}

| โมดัลลิตี | จำนวน | เครื่องมือตัวอย่าง |
|----------|-------|---------------|
| **รูปภาพ** | 107 | ปรับขนาด, ครอป, บีบอัด, แปลง, ลบพื้นหลัง, ขยายภาพ, OCR, ลายน้ำ, คอลลาจ, ลงสี, เครื่องมือ GIF, พรีเซ็ตรูปแบบ |
| **วิดีโอ** | 57 | ตัด, ครอป, บีบอัด, แปลง, รวม, แยกเสียง, คำบรรยายอัตโนมัติ, วิดีโอเป็น GIF, ปรับขนาด, ทำให้ภาพนิ่ง, พรีเซ็ตรูปแบบ |
| **เสียง** | 27 | ตัด, รวม, แปลง, นอร์มัลไลซ์, ลดสัญญาณรบกวน, ถอดเสียง, ปรับระดับเสียง, เฟด, สร้างริงโทน, พรีเซ็ตรูปแบบ |
| **PDF / เอกสาร** | 29 | รวม, แยก, บีบอัด, OCR, ลายน้ำ, ปกปิดข้อมูล, Word เป็น PDF, Excel เป็น PDF, หมุน, ป้องกัน, ซ่อมแซม |
| **ไฟล์** | 23 | CSV เป็น JSON, JSON เป็น XML, รวม CSV, แยก CSV, สร้าง ZIP, แตก ZIP, สร้างแผนภูมิ, YAML/JSON |

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
