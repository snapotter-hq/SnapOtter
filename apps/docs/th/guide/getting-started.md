---
description: "ติดตั้ง SnapOtter ด้วย Docker ในคำสั่งเดียว เข้าสู่ระบบ แล้วเปิดเครื่องมือแรกของคุณ ครอบคลุมการเร่งความเร็วด้วย GPU เครื่องขนาดเล็ก Docker Compose และการสร้างจากซอร์สโค้ด"
i18n_source_hash: c2aae540add0
i18n_provenance: machine
i18n_output_hash: 175a21458deb
i18n_hash_version: 2
---

# เริ่มต้นใช้งาน {#getting-started}

::: tip ลองใช้ก่อนติดตั้ง
สำรวจ UI แบบเต็มได้ที่ [demo.snapotter.com](https://demo.snapotter.com) ไม่ต้องสมัครหรือติดตั้ง
:::

## เริ่มต้นอย่างรวดเร็ว {#quick-start}

รันคำสั่งเดียว:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

จากนั้นเปิด [http://localhost:1349](http://localhost:1349) แล้วเข้าสู่ระบบด้วย `admin` / `admin` ระบบจะขอให้คุณเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก

ตอนนี้เปิดเครื่องมือสักตัว เลือกจากแถบด้านข้าง หรือไปที่ [Resize](http://localhost:1349/image/resize) โดยตรง วางภาพลงไป แล้วดาวน์โหลดผลลัพธ์

การติดตั้งมีเพียงเท่านี้ คอนเทนเนอร์เดียวนี้รันทุกอย่างที่ต้องใช้ เมื่อไม่ได้ตั้งค่า `DATABASE_URL` ระบบจะเริ่ม PostgreSQL และ Redis ของตัวเองบนอินเทอร์เฟซ loopback (โหมดฝังในตัว) และเก็บข้อมูลทั้งหมดไว้ในวอลุ่ม `SnapOtter-data` นี่เป็นวิธีที่เร็วที่สุดในการลองใช้ SnapOtter หรือโฮสต์เองบนโฮมแล็บ โหมดฝังในตัวรันด้วยสิทธิ์ root (ค่าเริ่มต้น) และจะปิดตัวเองโดยอัตโนมัติทันทีที่คุณตั้งค่า `DATABASE_URL` สำหรับการใช้งานจริง ให้ใช้ [สแต็ก Docker Compose](#docker-compose) ซึ่งแยก PostgreSQL และ Redis ไว้ในคอนเทนเนอร์ของตัวเอง

ผลลัพธ์ของงานไม่ได้เก็บไว้ในวอลุ่มข้อมูล จึงหายไปเมื่อเปลี่ยนคอนเทนเนอร์ (เช่น ตอนอัปเกรดอิมเมจ) และลิงก์ดาวน์โหลดก็ใช้งานไม่ได้อีก หัวข้อ [การเก็บผลลัพธ์ของงาน](/th/guide/deployment#keeping-job-output) ในคู่มือการติดตั้งใช้งานอธิบายวิธีเก็บผลลัพธ์เหล่านี้ไว้

::: tip การรันบน RAM 4 GB หรือน้อยกว่า
บน Raspberry Pi แล็ปท็อปเก่า หรือ VPS ขนาดเล็ก ให้รันทีละงาน จำกัดเธรดพูลของงานภาพด้วยการเพิ่ม `-e CONCURRENT_JOBS=1 -e MAX_WORKER_THREADS=2` ในคำสั่งข้างต้น และข้ามบันเดิล AI ที่หนัก [การตั้งค่าสำหรับทรัพยากรจำกัด](/th/guide/low-resource#tuning-knobs) รวบรวมขีดจำกัดอื่นที่ควรตั้งค่า และสิ่งที่คาดหวังได้จากฮาร์ดแวร์ที่มีข้อจำกัด
:::

::: tip การวิเคราะห์ผลิตภัณฑ์แบบไม่ระบุตัวตน
SnapOtter มีการวิเคราะห์ผลิตภัณฑ์แบบไม่ระบุตัวตนเป็นค่าเริ่มต้น หากต้องการปิด ให้เปิด **Settings → System → Privacy** แล้วปิด **Anonymous Product Analytics** การทำงานจะหยุดทันทีสำหรับทั้งอินสแตนซ์

คุณยังตั้งค่าตัวแปรสภาพแวดล้อม `SNAPOTTER_TELEMETRY=0` (ใช้ `false` และ `off` ได้เช่นกัน) เพื่อปิดการส่งข้อมูลเทเลเมทรีทั้งหมดของอินสแตนซ์โดยไม่ต้องสร้างใหม่

การติดตามข้อผิดพลาดขับเคลื่อนโดย [Sentry](https://sentry.io) ซึ่งสนับสนุน SnapOtter ผ่านโปรแกรมโอเพนซอร์สของ Sentry

ดูรายละเอียดว่ามีการเก็บข้อมูลอะไรบ้างได้ที่ [SnapOtter เก็บข้อมูลอะไร](/th/guide/telemetry)
:::

## การเร่งความเร็วด้วย GPU {#gpu-acceleration}

NVIDIA GPU ทำให้เครื่องมือ AI ที่หนักเร็วขึ้นมาก ได้แก่ การขยายภาพ (เร็วขึ้นประมาณ 47 เท่า) การปรับปรุงใบหน้า (ประมาณ 12 เท่า) การถอดเสียง และการลบพื้นหลัง (อย่างละประมาณ 4 เท่า) ส่วน OCR การตรวจจับใบหน้า และการฟื้นฟูภาพถ่ายยังคงใช้ CPU ดังนั้น GPU ไม่ช่วยงานเหล่านี้ อิมเมจเดียวกันรองรับทั้งสองแบบ ให้เพิ่ม `--gpus all`:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

ต้องติดตั้ง [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) บนโฮสต์ หากไม่มี CUDA SnapOtter จะย้อนกลับไปใช้ CPU เอง การเร่งความเร็วด้วย iGPU ของ Intel/AMD ผ่าน VA-API, Quick Sync หรือ OpenCL ยังไม่รองรับสำหรับการอนุมาน AI ในปัจจุบัน

- [ความต้องการด้านฮาร์ดแวร์](/th/guide/deployment#full-ai-tools-on-nvidia-cuda) มีเวลาประมวลผลของ GPU และ CPU ครบถ้วน และ [เบนช์มาร์กอิมเมจ Docker](/th/guide/docker-tags#benchmarks) มีตัวเลขการเริ่มแบบอุ่นและแบบเย็น
- หากเครื่องมือ AI ยังทำงานบน CPU ให้ดู [ตรวจสอบการเร่งความเร็วด้วย GPU](/th/guide/deployment#verify-gpu-acceleration)
- สำหรับ Compose ให้ใช้ [NVIDIA CUDA Quick Start](/th/guide/deployment#quick-start-nvidia-cuda) ในคู่มือการติดตั้งใช้งาน

## วิธีติดตั้งอื่น ๆ {#other-ways-to-install}

### คอนเทนเนอร์เดียวด้วย Compose {#single-container-compose}

คอนเทนเนอร์โหมดฝังในตัวแบบเดียวกับหัวข้อเริ่มต้นอย่างรวดเร็ว แต่เขียนเป็นไฟล์ Compose เพื่อให้ติดตามและแก้ไขได้ง่ายขึ้น บันทึกเป็น `docker-compose.yml` แล้วรัน `docker compose up -d`:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace  # keeps job results across upgrades
    environment:
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin  # you're asked to change it on first login
    restart: unless-stopped
    # mem_limit: 4g
    # cpus: 2

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
```

เช่นเดียวกับคำสั่ง `docker run` วิธีนี้เหมาะสำหรับลองใช้ SnapOtter และการติดตั้งขนาดเล็ก ทุกการตั้งค่าใน [การกำหนดค่า](/th/guide/configuration) ให้ใส่ไว้ใต้ `environment`

### Docker Compose (สำหรับการใช้งานจริง) {#docker-compose}

ใช้ไฟล์สำหรับการใช้งานจริงที่ดูแลและทดสอบพร้อมกับแต่ละรุ่น แทนการคัดลอกตัวอย่าง Compose แบบย่อจากหน้านี้:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

เปิด [http://localhost:1349](http://localhost:1349) แล้วเข้าสู่ระบบด้วย `admin` / `admin`

[`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) มาตรฐานรวมวอลุ่มรันไทม์ทั้งสี่ตัว การตรวจสอบสถานะ ขีดจำกัดทรัพยากร การกำหนดค่า Redis แบบคงทน อิมเมจฐานข้อมูล/แคชที่ตรึงเวอร์ชัน และการเสริมความแข็งแกร่งของคอนเทนเนอร์ในปัจจุบัน เปลี่ยนรหัสผ่านผู้ดูแลระบบเริ่มต้นทันทีหลังเข้าสู่ระบบครั้งแรก หากต้องการการติดตั้งใช้งานที่ทำซ้ำได้ ให้ตรึงอิมเมจแอปพลิเคชัน SnapOtter ไว้ที่แท็กรุ่นหรือ digest ที่คุณตรวจสอบแล้ว แทนการตาม `latest`

ดู [การกำหนดค่า](/th/guide/configuration) สำหรับตัวแปรสภาพแวดล้อมทั้งหมด และ [ความปลอดภัยและการเสริมความแข็งแกร่ง](/th/guide/security) สำหรับความลับ นโยบายเครือข่าย และแนวทางการสำรองข้อมูล

### GitHub Container Registry {#ghcr}

ทั้ง Docker Hub และ GHCR เผยแพร่อิมเมจเดียวกันในทุกรุ่น หากต้องการดึงจาก GHCR ให้สลับชื่ออิมเมจ:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

### สร้างจากซอร์สโค้ด {#build-from-source}

**สิ่งที่ต้องมี:** Node.js 22.22+, pnpm 9+, Docker (สำหรับ Postgres + Redis), Python 3.11+ (สำหรับฟีเจอร์ AI), Git

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- ฟรอนต์เอนด์: [http://localhost:1351](http://localhost:1351)
- แบ็กเอนด์: [http://localhost:13490](http://localhost:13490)

## สิ่งที่คุณทำได้ {#what-you-can-do}

### การประมวลผลไฟล์ (200+ เครื่องมือ) {#file-processing-200-tools}

| ประเภท | จำนวน | ตัวอย่างเครื่องมือ |
|----------|-------|---------------|
| **ภาพ** | 112 | ปรับขนาด, ตัดภาพ, บีบอัด, แปลง, ลบพื้นหลัง, ขยายภาพ, OCR, ลายน้ำ, คอลลาจ, ใส่สี, เครื่องมือ GIF, พรีเซ็ตรูปแบบ |
| **วิดีโอ** | 59 | ตัดช่วง, ครอป, บีบอัด, แปลง, รวม, แยกเสียง, คำบรรยายอัตโนมัติ, วิดีโอเป็น GIF, ปรับขนาด, ลดภาพสั่น, พรีเซ็ตรูปแบบ |
| **เสียง** | 57 | ตัดช่วง, รวม, แปลง, ปรับระดับเสียง, ลดสัญญาณรบกวน, ถอดเสียงเป็นข้อความ, ปรับระดับเสียงสูงต่ำ, เฟด, สร้างเสียงเรียกเข้า, พรีเซ็ตรูปแบบ |
| **PDF / เอกสาร** | 37 | รวม, แยก, บีบอัด, OCR, ลายน้ำ, ปกปิดข้อมูล, Word เป็น PDF, Excel เป็น PDF, หมุน, ป้องกัน, ซ่อมแซม |
| **ไฟล์** | 25 | CSV เป็น JSON, JSON เป็น XML, รวม CSV, แยก CSV, สร้าง ZIP, แตก ZIP, สร้างแผนภูมิ, YAML/JSON |

### ไปป์ไลน์ {#pipelines}

เชื่อมเครื่องมือเป็นเวิร์กโฟลว์หลายขั้นตอนและใช้กับภาพเดียวหรือทั้งชุดได้:

1. เปิด **Pipelines** ในแถบด้านข้าง
2. เพิ่มขั้นตอน (เครื่องมือใดก็ได้ ตั้งค่าอย่างไรก็ได้)
3. รันกับไฟล์เดียว หรือทั้งชุดพร้อมกัน
4. บันทึกไปป์ไลน์ไว้ใช้ซ้ำภายหลัง

ไปป์ไลน์อนุญาตได้ 20 ขั้นตอนตามค่าเริ่มต้น ตั้งค่า `MAX_PIPELINE_STEPS=0` เพื่อให้ไม่จำกัดจำนวน

### คลังไฟล์ {#file-library}

ไฟล์ทุกไฟล์ที่คุณประมวลผลสามารถบันทึกลงคลัง **Files** ของคุณได้ SnapOtter ติดตามประวัติเวอร์ชันทั้งหมด ทำให้คุณย้อนดูทุกขั้นตอนการประมวลผลได้ตั้งแต่ไฟล์ต้นฉบับที่อัปโหลดจนถึงผลลัพธ์สุดท้าย

การบันทึกเป็นการเลือกเอง ผลลัพธ์ที่คุณบันทึกลงคลังจะถูกเก็บไว้จนกว่าคุณจะลบ ส่วนผลลัพธ์ที่ประมวลผลแล้วไม่ได้บันทึกจะถูกล้างอัตโนมัติหลังจาก 72 ชั่วโมง (กำหนดค่าได้ผ่าน `FILE_MAX_AGE_HOURS`)

### REST API และคีย์ API {#rest-api-api-keys}

ทุกเครื่องมือเรียกใช้ได้ผ่าน HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

สร้างคีย์ API ได้ที่ **Settings → API Keys** ดู [เอกสารอ้างอิง REST API](/th/api/rest) สำหรับเอ็นด์พอยต์ทั้งหมด หรือเยี่ยมชม [http://localhost:1349/api/docs](http://localhost:1349/api/docs) สำหรับเอกสารอ้างอิงแบบโต้ตอบ

### หลายผู้ใช้และทีม {#multi-user-teams}

เปิดใช้งานหลายผู้ใช้พร้อมการควบคุมการเข้าถึงตามบทบาท:

- **Admin**: เข้าถึงได้เต็มรูปแบบ จัดการผู้ใช้ ทีม การตั้งค่า รวมถึงไฟล์/ไปป์ไลน์/คีย์ API ทั้งหมด
- **User**: ใช้เครื่องมือ และจัดการไฟล์/ไปป์ไลน์/คีย์ API ของตนเอง

สร้างทีมได้ที่ **Settings → Teams** เพื่อจัดกลุ่มผู้ใช้

ตั้งค่า `AUTH_ENABLED=true` (หรือ `false` สำหรับผู้ใช้คนเดียว/ใช้เองโดยไม่ต้องเข้าสู่ระบบ)

## ใช้งานจากโทรศัพท์ {#use-it-from-your-phone}

SnapOtter ใช้งานได้ในเบราว์เซอร์บนมือถือ และคุณติดตั้งเป็นแอปได้ด้วย เปิดอินสแตนซ์ของคุณบนโทรศัพท์ แล้ว:

- **iPhone / iPad (Safari):** แตะ Share แล้วเลือก **Add to Home Screen**
- **Android (Chrome):** เปิดเมนูเบราว์เซอร์แล้วแตะ **Install app**

แอปที่ติดตั้งจะเปิดในหน้าต่างของตัวเอง ตรงไปยังอินสแตนซ์ของคุณ

ข้อควรทราบอย่างหนึ่ง เบราว์เซอร์จะแสดงข้อความให้ติดตั้งเฉพาะบน HTTPS ที่อยู่ HTTP ธรรมดาใน LAN ยังใช้งานในแท็บเบราว์เซอร์ได้ตามปกติ แต่หากต้องการติดตั้งจริง ให้วางอินสแตนซ์ไว้หลัง reverse proxy ที่มีใบรับรอง (ดู [คู่มือการติดตั้งใช้งาน](/th/guide/deployment))

บนโทรศัพท์และแท็บเล็ต เครื่องมือภาพจะมีปุ่ม **Take photo** อยู่ข้างปุ่มอัปโหลด ถ่ายใบเสร็จหรือกระดานไวต์บอร์ด แล้วภาพจะเข้าสู่เครื่องมือทันที