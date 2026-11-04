---
description: "ติดตั้ง SnapOtter ในระบบจริงด้วย Docker ครอบคลุมความต้องการด้านฮาร์ดแวร์ การตั้งค่า GPU และการกำหนดค่า reverse proxy สำหรับ Nginx, Traefik และ Cloudflare"
i18n_source_hash: 0c8f078ebe75
i18n_provenance: machine
i18n_output_hash: f5293d0da6bb
i18n_hash_version: 2
---

# การติดตั้งใช้งาน {#deployment}

SnapOtter ติดตั้งเป็นสแตก Docker Compose ที่มี 3 คอนเทนเนอร์ ได้แก่ อิมเมจแอป SnapOtter, PostgreSQL 17 และ Redis 8 อิมเมจแอปรองรับ **linux/amd64** (พร้อม NVIDIA CUDA สำหรับเร่งความเร็ว AI) และ **linux/arm64** (CPU) จึงทำงานได้โดยตรงบนเซิร์ฟเวอร์ Intel/AMD, Mac ที่ใช้ Apple Silicon และอุปกรณ์ ARM เช่น Raspberry Pi 4/5 ปัจจุบันยังไม่รองรับการเร่งความเร็วด้วย iGPU ของ Intel/AMD ผ่าน VA-API, Quick Sync หรือ OpenCL สำหรับการอนุมาน AI

ดู [อิมเมจ Docker](./docker-tags) สำหรับการตั้งค่า GPU ตัวอย่าง Docker Compose และการปักหมุดเวอร์ชัน

## เริ่มต้นอย่างรวดเร็ว (CPU) {#quick-start-cpu}

```yaml
# docker-compose.yml - Copy this file and run: docker compose up -d
services:
  SnapOtter:
    image: snapotter/snapotter:latest    # or ghcr.io/snapotter-hq/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"                # Web UI + API
    volumes:
      - SnapOtter-data:/data           # AI models, user files (PERSISTENT)
      - SnapOtter-workspace:/tmp/workspace  # Temp processing files (can be tmpfs)
    environment:
      # --- Authentication ---
      - AUTH_ENABLED=true          # Set to false to disable login entirely
      - DEFAULT_USERNAME=admin     # First-run admin username
      - DEFAULT_PASSWORD=admin     # First-run admin password (you'll be forced to change it)

      # --- Database + Queue ---
      # Requests are served by a role that can only read and write rows. The
      # owner connects only during boot, to migrate and to grant. Set
      # POSTGRES_APP_PASSWORD and POSTGRES_PASSWORD for any non-local deployment.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=loopback,linklocal,uniquelocal  # Which peers may set the client IP via X-Forwarded-For (default shown)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)

      # --- Engines (empty = the image's own binaries, see Configuration) ---
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"            # Needed for Python ML shared memory
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
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
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:       # Named volume - Docker manages permissions automatically
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose up -d
```

จากนั้นจะเข้าใช้แอปได้ที่ `http://localhost:1349`

สแตกข้างต้นเชื่อมต่อในฐานะเจ้าของฐานข้อมูล ตั้งแต่ SnapOtter 2.3.0 คุณสามารถให้บริการคำขอด้วยบทบาทที่อ่านและเขียนแถวข้อมูลได้เท่านั้น ดู [บทบาทสิทธิ์ขั้นต่ำ](./database#least-privilege-roles)

> **ติดปัญหาขีดจำกัดของ Docker Hub?** ให้แทนที่ `snapotter/snapotter:latest` ด้วย `ghcr.io/snapotter-hq/snapotter:latest` เพื่อดึงอิมเมจจาก GitHub Container Registry แทน ทั้งสองรีจิสทรีได้รับอิมเมจเดียวกันในทุกรุ่น

## เริ่มต้นอย่างรวดเร็ว (NVIDIA CUDA) {#quick-start-nvidia-cuda}

สำหรับการเร่งความเร็วด้วย NVIDIA CUDA ในเครื่องมือ AI ที่รองรับ (ลบพื้นหลัง ขยายภาพ ปรับปรุงใบหน้า):

```yaml
# docker-compose-gpu.yml - Requires: NVIDIA GPU + nvidia-container-toolkit
# Install toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      # Runtime role (rows only) and the boot-only owner connection. See the CPU
      # example above.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Engines (empty = the image's own binaries, see Configuration)
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"                # Required for PyTorch CUDA shared memory
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all           # Or set to 1 for a specific GPU
              capabilities: [gpu]
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
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
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose -f docker-compose-gpu.yml up -d
```

### ตรวจสอบการเร่งความเร็วด้วย GPU {#verify-gpu-acceleration}

ตรวจสอบการตรวจพบ CUDA ในบันทึก:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

หากเครื่องมือ AI ยังทำงานบน CPU ทั้งที่ตั้งค่า `--gpus all` และ NVIDIA Container Toolkit ถูกต้องแล้ว ให้ติดตั้งชุดที่เกี่ยวข้องใหม่ (เช่น การลบพื้นหลัง) จาก **การตั้งค่า → ฟีเจอร์ AI** ตัวติดตั้งจะคืนค่า ONNX Runtime รุ่นสำหรับ GPU ซึ่งอาจถูกรุ่น CPU เท่านั้นที่ชุดอื่น (เช่น การถอดเสียง) ดึงเข้ามาบดบังในสภาพแวดล้อม AI ที่ใช้ร่วมกัน หากการติดตั้งใหม่จาก UI ไม่คืนค่า GPU บนอิมเมจรุ่นเก่า ให้ดูขั้นตอนซ่อมแซมด้วยตนเองใน [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490)

## ความต้องการด้านฮาร์ดแวร์ {#hardware-requirements}

ตัวเลขเหล่านี้มาจากการทดสอบประสิทธิภาพบนระบบหลายแบบ ตั้งแต่เวิร์กสเตชัน amd64 รุ่นใหม่ที่ใช้ NVIDIA RTX 4070 ไปจนถึง Raspberry Pi โดยรันเครื่องมือทั้งแค็ตตาล็อกบนแต่ละเครื่อง และปรับขีดจำกัดทรัพยากรของ Docker เพื่อหาค่าต่ำสุดที่ใช้งานได้จริง

หากคุณรันในระดับล่างสุดของตารางนี้ (Pi แล็ปท็อปเก่า หรือ VPS ขนาด 2 GB) [การตั้งค่าสำหรับทรัพยากรจำกัด](/th/guide/low-resource) จะแปลงตัวเลขเหล่านี้เป็นขั้นตอนที่ทำตามได้จริงพร้อมค่าจำกัดที่ปรับแล้ว

### ตารางอ้างอิงด่วน {#quick-reference}

| ระดับ | กรณีใช้งาน | CPU | RAM | GPU | พื้นที่จัดเก็บ |
|------|----------|-----|-----|-----|---------|
| ต่ำสุด | เครื่องมือที่ไม่ใช้ AI (ภาพ ไฟล์ PDF แบบเบา) รวมถึง Fast OCR และการตรวจจับใบหน้าในตัว ผู้ใช้คนเดียว ชุดงานขนาดเล็ก | 2 คอร์ | 2 GB | ไม่มี | ~7 GB |
| แนะนำ | ทั้งห้ากลุ่มงาน รวมวิดีโอ PDF และชุด AI มาตรฐานบน CPU ชุดงาน ผู้ใช้ไม่กี่คน | 4 คอร์ | 4 GB (8 GB สำหรับ HQ inpainting) | ไม่มี | ~25 GB |
| เต็มรูปแบบ | ทุกอย่างด้วยความเร็วสูง รวม AI บน GPU ชุดงานขนาดใหญ่ ผู้ใช้จำนวนมาก | 6-8 คอร์ | 8 GB | NVIDIA VRAM 8 GB ขึ้นไป (12 GB สบายที่สุด) | ~35 GB |

**สถาปัตยกรรม: 64 บิตเท่านั้น** (`linux/amd64` หรือ `linux/arm64`) SnapOtter ทำงานได้โดยตรงบนเซิร์ฟเวอร์ Intel/AMD, Mac ที่ใช้ Apple Silicon และบอร์ด ARM 64 บิต รวมถึง **Raspberry Pi 4 และ 5** (4-8 GB) แต่ **ไม่รองรับ** ARM 32 บิต (`armv7`/`armhf`) เนื่องจากไม่มีการสร้างอิมเมจสำหรับสถาปัตยกรรมนั้น และไม่รองรับบอร์ดระดับ 512 MB เช่น Pi Zero ซึ่งต่ำกว่าเกณฑ์หน่วยความจำขั้นต่ำ (ดูด้านล่าง)

### ต่ำสุด (เครื่องมือภาพ ไฟล์ และ PDF แบบเบา ไม่ใช้ AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| ทรัพยากร | ความต้องการ |
|---|---|
| CPU | 2 คอร์ |
| RAM | 2 GB |
| ดิสก์ | ~5.5 GB (อิมเมจ) + วอลุ่มข้อมูล |
| GPU | ไม่จำเป็น |

เครื่องมือในแค็ตตาล็อกที่ไม่ใช้ AI ทั้ง 222 รายการ ได้แก่ ภาพ (ปรับขนาด ครอบตัด แปลง บีบอัด ปรับแต่ง ใส่ลายน้ำ) วิดีโอ (ตัดต่อ ปิดเสียง remux) เสียง (แปลง ปรับระดับเสียง ตัดต่อ) PDF (รวม แยก บีบอัด หมุน ป้องกัน) การแปลงไฟล์ และพรีเซ็ตการแปลงเฉพาะทาง ทำงานได้บนฮาร์ดแวร์ระดับธรรมดา การทำงานส่วนใหญ่เสร็จภายในไม่ถึงหนึ่งวินาทีแม้กับไฟล์ขนาดใหญ่ ภาพขนาด 2.7 MB ปรับขนาดได้ในราว 0.05 วินาที และเข้ารหัสใหม่เป็น WebP ได้ในราว 2 วินาที

เกณฑ์หน่วยความจำขั้นต่ำนี้เป็นของจริง มาจากการทดสอบขีดจำกัดทรัพยากรของ Docker: **512 MB ไม่สามารถเริ่มสแตกได้** (แม้แต่การปรับขนาดภาพเดียวก็ถูกปิดโดยระบบ) **1 GB** รองรับการทำงานกับไฟล์เดียวได้ แต่ชุดงานหลายไฟล์จะหน่วยความจำไม่พอ และ **2 GB / 2 คอร์** เป็นการตั้งค่าที่เล็กที่สุดที่รองรับชุดงานที่ไม่ใช้ AI ได้อย่างสบาย Fast OCR ในตัวและชุด `face-detection` ก็อยู่ภายในขอบเขต 2 GB เช่นกัน ส่วนชุด AI ที่ใหญ่กว่า (Whisper, LaMa/DDColor, rembg, RealESRGAN, การฟื้นฟูภาพถ่าย และ SD1.5 HQ inpainting) ต้องใช้ RAM 4 ถึง 8 GB และจะถูกปฏิเสธทันทีเมื่อหน่วยความจำว่างต่ำกว่าเกณฑ์ขั้นต่ำของแต่ละชุด

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**ข้อยกเว้นเดียวที่ใช้ CPU หนักคือการเข้ารหัสวิดีโอใหม่** การคัดลอกสตรีม (ตัดต่อ ปิดเสียง remux คอนเทนเนอร์) เสร็จทันที แต่การแปลงเป็นโคเดกอื่นต้องใช้ CPU เป็นหลัก คลิป 1080p ความยาว 45 วินาทีที่เข้ารหัสใหม่เป็น VP9 (WebM) ใช้เวลาราว **~40 วินาที** บน CPU รุ่นใหม่ที่เร็ว ~45 วินาทีบน Apple Silicon ~80 วินาทีบนแล็ปท็อป 4 คอร์รุ่นเก่า และ **~130 วินาที** บนเซิร์ฟเวอร์ 4 คอร์รุ่นเก่า หากงานของคุณเน้นวิดีโอ ให้ให้ความสำคัญกับจำนวนคอร์และความเร็วสัญญาณนาฬิกา หรือเพิ่มขีดจำกัด `cpus:` ของคอนเทนเนอร์ โดยค่าเริ่มต้น Compose ที่จัดส่งมากำหนดให้แอปใช้ได้ 4 คอร์ (8 คอร์ใน Compose สำหรับ GPU)

### แนะนำ (เครื่องมือ AI บน CPU) {#recommended-ai-tools-on-cpu}

| ทรัพยากร | ความต้องการ |
|---|---|
| CPU | 4 คอร์ |
| RAM | 4 GB |
| ดิสก์ | 3 GB (อิมเมจ) + ประมาณ 20 GB (ชุด AI เสริมทั้งหมด) + พื้นที่ทำงาน |
| GPU | ไม่จำเป็น (ใช้ CPU แทน) |

**การติดตั้งและรันชุด AI ที่ใหญ่กว่าเป็นเหตุผลที่ทำให้คำแนะนำเพิ่มเป็น RAM 4 GB** เมื่อไม่ได้ติดตั้งชุดเสริมใดเลย แอปจะใช้หน่วยความจำราว 360 MB ขณะว่าง เครื่องมือ Python รุ่นเดิมใช้ sidecar ร่วมกัน ส่วน OCR แบบแม่นยำใช้ dispatcher อายุยืนเฉพาะที่ผูกกับเจเนอเรชันที่ไม่เปลี่ยนแปลงซึ่งใช้งานอยู่ ก่อนเปิดใช้งาน ตัวติดตั้งจะรันการทดสอบเบื้องต้นกับตัวเลือกใหม่ จากนั้นจึงสลับไปยัง dispatcher ตัวใหม่แบบอะตอมมิก และระบายงานของ dispatcher ตัวก่อนหน้าก่อนเก็บขยะ อาร์ติแฟกต์ OCR แบบแม่นยำที่เป็นทางการทุกรายการต้องผ่านชุดทดสอบกรณีเลวร้ายที่สุดก่อนปล่อยภายใน cgroup ขนาด 4 GiB ขณะที่คำแนะนำโฮสต์ 4 GB เผื่อพื้นที่ไว้สำหรับแอปพลิเคชัน Node.js, Postgres, Redis, คิว และงานที่ทำงานพร้อมกัน

เครื่องมือ AI ส่วนใหญ่ใช้งานบน CPU ได้ดี มีเพียงไม่กี่รายการที่ต้องการ GPU จริงๆ ค่าที่วัดบน CPU 4 คอร์รุ่นใหม่:

| เครื่องมือ AI | เวลาบน CPU | ใช้บน CPU ได้หรือไม่ |
|---|---|---|
| การตรวจจับใบหน้า (blur-faces, smart-crop, red-eye), noise-removal | ไม่ถึง 1 วินาที | ได้ |
| OCR, การถอดเสียง, คำบรรยาย | 1-3 วินาที | ได้ |
| ใส่สี ปรับปรุงใบหน้า | ~10 วินาที | ได้ |
| ลบ / แทนที่ / เบลอพื้นหลัง | ~29 วินาที | ได้ (ต้องรอ) |
| ขยายภาพด้วย AI (RealESRGAN) | ~33 วินาทีสำหรับภาพเล็ก หลายนาทีสำหรับภาพใหญ่ | พอใช้ได้ แนะนำ GPU อย่างยิ่ง |
| การฟื้นฟูภาพถ่าย (ไปป์ไลน์เต็ม) | หลายนาที | ไม่เหมาะ ต้องใช้ GPU หรือ CPU หลายคอร์ที่เร็ว |

SnapOtter ตั้งใจไม่ฝังการดาวน์โหลดโมเดลเหล่านี้ไว้ในอิมเมจ Docker ชุด AI จะถูกดึงมาเมื่อผู้ดูแลระบบเปิดใช้เครื่องมือที่เกี่ยวข้องเท่านั้น เก็บไว้ในวอลุ่ม `/data/ai` แบบถาวร และใช้ร่วมกันโดยทุกเครื่องมือที่พึ่งพาโมเดลชุดเดียวกัน วิธีนี้ทำให้อิมเมจคอนเทนเนอร์สุดท้ายมีขนาดเล็ก ขณะที่การติดตั้ง AI แบบเต็มยังคงใช้พื้นที่ตามตัวเลขที่สูงกว่าด้านล่าง

เครื่องมือบางตัวพึ่งพาชุดที่ใช้ร่วมกันมากกว่าหนึ่งชุด ตัวอย่างเช่น Passport Photo ต้องใช้ทั้ง `background-removal` และ `face-detection` หากติดตั้ง `background-removal` ไว้แล้ว การเปิดใช้ Passport Photo จะดาวน์โหลดเฉพาะชุด `face-detection` ที่ขาดอยู่ เท่านั้น หลักการนำกลับมาใช้ซ้ำนี้ใช้กับเครื่องมือ AI ทั้งหมด

พื้นที่จัดเก็บของชุด AI เสริมและเกณฑ์หน่วยความจำ CPU ขั้นต่ำ (SnapOtter ตรวจสอบหน่วยความจำที่ว่างก่อนส่งงานไปยัง Python sidecar และปฏิเสธการรันทันทีหากต่ำกว่าเกณฑ์หน่วยความจำว่างของชุดนั้น):

| ชุด | ขนาดดิสก์ | เกณฑ์หน่วยความจำ CPU ขั้นต่ำ |
|---|---|---|
| การตรวจจับใบหน้า | 200-300 MB | RAM โฮสต์ 2 GB (ว่าง ~0.5 GB) |
| การถอดเสียง | ~600 MB | RAM โฮสต์ 4 GB (ว่าง ~2 GB) |
| ลบวัตถุ + ใส่สี | 1-2 GB | RAM โฮสต์ 4 GB (ว่าง ~2 GB) |
| OCR แบบแม่นยำ (`balanced`/`best`) | ดาวน์โหลด ~208-234 MiB / ติดตั้ง ~409-488 MiB | หน่วยความจำที่มีผลตามที่กำหนด 4 GiB (`fast` ทำงานได้บน 2 GB) |
| การลบพื้นหลัง | 4-5 GB | RAM โฮสต์ 4 GB (ว่าง ~2.5 GB) |
| ขยายภาพ + ปรับปรุงใบหน้า + ลดสัญญาณรบกวน | 5-6 GB | RAM โฮสต์ 4 GB (ว่าง ~2.5 GB) |
| การฟื้นฟูภาพถ่าย | 4-5 GB | RAM โฮสต์ 4 GB (ว่าง ~3 GB) |
| Inpainting คุณภาพสูง (`inpaint-hq`) | 5-7 GB | RAM โฮสต์ 8 GB (ว่าง ~6 GB) |
| **ทุกชุด** | **ติดตั้ง ~25 GB** | **4 GB (8 GB เมื่อใช้ `inpaint-hq`)** |

Fast OCR ฝังอยู่ในอิมเมจผ่าน Tesseract เพิ่มขนาดราว 25 MiB และไม่ต้องใช้ชุด OCR เสริมหรือหน่วยความจำ 4 GiB ของชุดนั้น Fast รองรับ `auto`, `en`, `de`, `es`, `fr`, `zh` และ `ja` แต่ไม่รองรับภาษาเกาหลี (`ko`) หรืออาหรับ (`ar`) ทั้งสองภาษาใช้ `balanced` หรือ `best` จึงต้องใช้ชุดแบบแม่นยำ ชุดแบบแม่นยำมีให้ในคอนเทนเนอร์ Linux amd64 และ arm64 อย่างเป็นทางการ และรัน ONNX Runtime บน CPU โฮสต์ NVIDIA ใช้รันไทม์ OCR บน CPU ตัวเดียวกันนี้ ดังนั้น OCR จึงไม่ขึ้นกับเวอร์ชัน CUDA หรือสถาปัตยกรรม GPU รันไทม์แบบแม่นยำต้องใช้หน่วยความจำที่มีผลอย่างน้อย 4 GiB คือขีดจำกัด cgroup ของคอนเทนเนอร์ที่กำหนดไว้ หรือหน่วยความจำของโฮสต์หากไม่ได้กำหนด SnapOtter จะปฏิเสธระบบที่ต่ำกว่าเกณฑ์ขั้นต่ำด้านความเข้ากันได้ที่ลงนามไว้ก่อนดาวน์โหลดชุด การติดตั้งชุดแบบแม่นยำยังถูกปฏิเสธบนอาร์ไคฟ์แบบ bare-metal/สร้างสำเร็จรูปที่ไม่สามารถรับประกัน libc และ ABI ของ Python ได้ บนโฮสต์ที่ไม่รองรับเหล่านั้น OCR ภาษาเกาหลีและอาหรับจะส่งข้อผิดพลาดความเข้ากันไม่ได้อย่างชัดเจนและจะไม่ถอยกลับไปใช้ Fast อย่างเงียบๆ คำขอ Fast ที่ระบุภาษาเกาหลีโดยตรงจะได้รับ `FEATURE_INCOMPATIBLE` พร้อมเหตุผล `fast-korean-unsupported` ก่อนที่งานจะเข้าคิว

เรพลิกาที่ใช้ `DATA_DIR` ร่วมกันต้องใช้สถาปัตยกรรม CPU เดียวกัน สำหรับการติดตั้งหลายเรพลิกาให้ปักหมุดด้วย node affinity เรพลิกา amd64/arm64 ที่ปะปนกันต้องใช้วอลุ่มข้อมูลแยกกันและติดตั้ง SnapOtter แยกอิสระต่อกัน

รันไทม์แบบแม่นยำเก็บเจเนอเรชันที่ใช้งานไว้เพียงหนึ่งชุด และล้างแคชการดาวน์โหลดหลังเปิดใช้งาน สำหรับรุ่นนี้ การติดตั้งครั้งแรกต้องใช้พื้นที่ชั่วคราวราว 620-720 MiB สำหรับอาร์ไคฟ์และพื้นที่เตรียมการ และการอัปเกรดอาจใช้สูงสุดใกล้เคียง 1.2 GiB ในขณะที่เจเนอเรชันเก่ายังใช้งานอยู่ ตัวติดตั้งจะคำนวณความต้องการที่แน่นอนจากดัชนีที่ลงนามและเจเนอเรชันปัจจุบันก่อนดาวน์โหลดหรือแตกไฟล์ และจะล้มเหลวตั้งแต่ต้นหากวอลุ่มข้อมูลเล็กเกินไป

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### เต็มรูปแบบ (เครื่องมือ AI บน NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| ทรัพยากร | ความต้องการ |
|---|---|
| CPU | 6-8 คอร์ (การเตรียมวิดีโอและการทำงานพร้อมกันรันบน CPU แม้ใช้ AI บน GPU) |
| RAM | 8 GB |
| GPU | NVIDIA ที่มี VRAM 8 GB ขึ้นไป (แนะนำ 12 GB) |
| ดิสก์ | รวม ~35 GB |

GPU ของ NVIDIA (CUDA) ช่วยเร่งโมเดล AI ที่หนักได้อย่างมาก ค่าที่วัดบน RTX 4070 เทียบกับ CPU รุ่นใหม่:

| เครื่องมือ AI | ความเร็วที่เพิ่มขึ้นเมื่อใช้ GPU | หมายเหตุ |
|---|---|---|
| ขยายภาพด้วย AI (RealESRGAN 2×) | **~47×** | ได้ประโยชน์มากที่สุด ไม่ถึงหนึ่งวินาที เทียบกับ ~33 วินาที (หลายนาทีสำหรับภาพใหญ่) |
| ปรับปรุงใบหน้า (CodeFormer) | **~12×** | ~0.9 วินาที เทียบกับ ~11 วินาที |
| การถอดเสียง (Whisper) | ~4.5× | |
| ลบ / แทนที่ / เบลอพื้นหลัง | ~4× | ~7 วินาทีบน GPU เทียบกับ ~29 วินาทีบน CPU |
| ใส่สี | ~1.8× | |
| OCR, การตรวจจับใบหน้า, red-eye, noise-removal | ~1× | เร็วอยู่แล้วบน CPU GPU ไม่ช่วย |
| การฟื้นฟูภาพถ่าย | ไม่มี | ใช้ CPU เป็นหลักแม้บน GPU (การใช้ GPU 0%) CPU ที่เร็วสำคัญกว่า GPU ในกรณีนี้ |

เครื่องมือที่คุ้มค่ากับ GPU คือ **การขยายภาพ การปรับปรุงใบหน้า การถอดเสียง และการลบพื้นหลัง** การตรวจจับใบหน้า OCR และ red-eye ใช้ CPU เป็นหลักและเร็วอยู่แล้ว GPU จึงไม่ช่วยอะไร

การใช้ VRAM สูงสุดถึง 7.5 GB ระหว่างการขยายภาพร่วมกับการปรับปรุงใบหน้า GPU NVIDIA ขนาด 6 GB ใช้กับเครื่องมือ AI ส่วนใหญ่ได้เมื่อรันทีละรายการ แต่จะล้มเหลวกับการขยายภาพ VRAM 8-12 GB รองรับได้ทุกอย่าง

ปัจจุบันยังไม่รองรับการเร่งความเร็วด้วย iGPU ของ Intel/AMD ผ่าน VA-API, Quick Sync หรือ OpenCL สำหรับการอนุมาน AI การแมป `/dev/dri` เข้าไปในคอนเทนเนอร์ไม่ได้เปิดการเร่งความเร็ว AI ด้วย GPU SnapOtter จะรันเครื่องมือ AI บน CPU เว้นแต่จะมี NVIDIA CUDA

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

### ผู้ใช้พร้อมกัน {#concurrent-users}

คำขอปรับขนาดภาพแบบขนานกับคอนเทนเนอร์แอปที่จำกัด 4 คอร์ตามค่าเริ่มต้น:

| คำขอพร้อมกัน | เวลาตอบสนองเฉลี่ย | ข้อผิดพลาด |
|---|---|---|
| 1 | 0.4 วินาที | 0 |
| 5 | 1.2 วินาที | 0 |
| 10 | 2.1 วินาที | 0 |

เวลาตอบสนองเพิ่มขึ้นแบบต่ำกว่าเชิงเส้นและไม่มีข้อผิดพลาดเมื่อพูลเวิร์กเกอร์เต็ม การเพิ่มขีดจำกัด `cpus:` ของคอนเทนเนอร์แอป (หรือใช้โฮสต์ที่มีคอร์มากขึ้น) จะยกเพดานนี้ขึ้น โปรดทราบว่างานหนัก (การแปลงรหัสวิดีโอ AI บน CPU) จะกินเวิร์กเกอร์หนึ่งตัวตลอดช่วงเวลาทำงาน ดังนั้นให้กำหนดขนาด CPU ตามจำนวนงานหนักที่คาดว่าจะรันพร้อมกัน ไม่ใช่แค่จำนวนคำขอ

### รูปแบบภาพที่รองรับ {#supported-image-formats}

SnapOtter รองรับ **รูปแบบอินพุตมากกว่า 55 รูปแบบ** และ **รูปแบบเอาต์พุต 14 รูปแบบ** รวมถึงไฟล์ RAW จากกล้องมากกว่า 20 ยี่ห้อ รูปแบบระดับมืออาชีพ (PSD, EPS, OpenEXR, HDR) โคเดกสมัยใหม่ (JPEG XL, AVIF, HEIC, QOI) และรูปแบบทางวิทยาศาสตร์/เกม (FITS, DDS)

ดู [รายการรูปแบบทั้งหมด](/th/guide/supported-formats) สำหรับรายละเอียดของทุกรูปแบบที่รองรับ ตัวถอดรหัสที่ใช้ และตัวควบคุมคุณภาพที่มี

### ข้อจำกัดที่ทราบ {#known-limitations}

- **การปรับขนาดแบบรับรู้เนื้อหา** ขัดข้องกับภาพขนาดใหญ่ (>5 MP) เนื่องจากข้อจำกัดของไบนารี caire ใช้งานได้ปกติกับภาพที่เล็กกว่า
- **การถอดรหัส HEIF** ใช้เวลา 13-23 วินาที ส่วน HEIC (รุ่นของ Apple) เร็วกว่ามากที่ 0.3-0.9 วินาที
- **การขยายภาพ** หมดเวลาบน CPU สำหรับภาพที่ใหญ่กว่าขนาดเล็ก ต้องใช้ GPU จึงจะใช้งานได้จริง
- **CodeFormer** สำหรับปรับปรุงใบหน้าช้ากว่า GFPGAN อย่างมาก (53 วินาทีเทียบกับ 2 วินาทีบน GPU) แนะนำ GFPGAN สำหรับกรณีใช้งานส่วนใหญ่

## วอลุ่ม {#volumes}

| จุดเมานต์ / วอลุ่ม | วัตถุประสงค์ | จำเป็นหรือไม่ |
|---|---|---|
| `/data` (app) | โมเดล AI, Python venv, ไฟล์ของผู้ใช้ | **จำเป็น** - ไฟล์จะสูญหายหากไม่มี |
| `/tmp/workspace` (app) | ไฟล์ประมวลผลชั่วคราว (ล้างอัตโนมัติ) | แนะนำ |
| `SnapOtter-pgdata` (postgres) | ไดเรกทอรีข้อมูล PostgreSQL (ผู้ใช้ การตั้งค่า ไปป์ไลน์ งาน) | **จำเป็น** - ข้อมูลจะสูญหายหากไม่มี |
| `SnapOtter-redisdata` (redis) | ไฟล์ append-only ของ Redis สำหรับคิวงานที่คงทน | แนะนำ |

### Bind mount เทียบกับ named volume {#bind-mounts-vs-named-volumes}

**Named volume** (แนะนำ) - Docker จัดการสิทธิ์ให้อัตโนมัติ:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mount** - คุณต้องจัดการสิทธิ์เอง ตั้งค่า `PUID`/`PGID` ให้ตรงกับผู้ใช้ของโฮสต์:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### สิทธิ์ของพื้นที่จัดเก็บ {#storage-permissions}

SnapOtter เขียนข้อมูลไปยังสองตำแหน่งขณะทำงาน คือ `/data` (ไฟล์ของผู้ใช้ บันทึก โมเดล AI และ Python venv) และ `/tmp/workspace` (พื้นที่ชั่วคราวสำหรับการประมวลผล) ทั้งสองตำแหน่งต้องเขียนได้โดยผู้ใช้ที่คอนเทนเนอร์ใช้รัน หากตำแหน่งใดเขียนไม่ได้ คอนเทนเนอร์จะ **ล้มเหลวทันทีตอนเริ่มต้น** พร้อมข้อความที่ระบุไดเรกทอรี UID/GID ที่ใช้รัน และวิธีแก้ไข แทนที่จะเริ่มทำงานแล้วขึ้นสถานะ "healthy" ก่อนจะล้มเหลวในการอัปโหลดครั้งแรกด้วยข้อผิดพลาดที่เข้าใจยาก ไดเรกทอรีบันทึก (`LOG_DIR`, `/data/logs` ในอิมเมจ) ถูกตรวจสอบด้วยวิธีเดียวกันในทุกโหมดพื้นที่จัดเก็บ เพราะบันทึกยังคงอยู่ในเครื่องแม้ไฟล์จะอยู่บน S3

วิธีจัดการสิทธิ์ขึ้นอยู่กับวิธีเริ่มคอนเทนเนอร์:

**ค่าเริ่มต้น (เริ่มด้วย root แล้วลดสิทธิ์เป็น `snapotter`)** - entrypoint เริ่มด้วย root แก้ไขความเป็นเจ้าของของวอลุ่มที่เมานต์ แล้วลดสิทธิ์เป็นผู้ใช้ `snapotter` ที่ไม่มีสิทธิ์พิเศษผ่าน `gosu` Named volume ใช้งานได้โดยไม่ต้องตั้งค่า สำหรับ bind mount ให้ตั้งค่า `PUID`/`PGID` เป็นผู้ใช้ของโฮสต์ (ด้านบน) เพื่อให้ไฟล์ที่เขียนเป็นของคุณ

**Kubernetes / OpenShift (ไม่ใช้ root ผ่าน `runAsUser`)** - เมื่อเริ่มตรงด้วยผู้ใช้ที่ไม่ใช่ root คอนเทนเนอร์ไม่สามารถ chown วอลุ่มเองได้ ผู้ควบคุมจึงต้องทำให้วอลุ่มเขียนได้ ตั้งค่า `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

ไดเรกทอรีที่เขียนได้ของอิมเมจเป็นของกลุ่ม GID 0 และกลุ่มเขียนได้ ดังนั้นพ็อดที่รันด้วย **UID ใดก็ได้** ร่วมกับกลุ่มเสริม root (ค่าเริ่มต้นของ OpenShift) จึงเขียนได้โดยไม่ต้องใช้ `chown`

**TrueNAS Scale (และการตั้งค่า "UID แปลกหน้า" อื่นๆ)** - TrueNAS รันแอปด้วยผู้ใช้ที่ไม่ใช่ root (มักเป็น `568:568`) และเมานต์ชุดข้อมูลของโฮสต์ที่เป็นของผู้ใช้คนละคน ทำให้ทั้ง entrypoint และ `fsGroup` ไม่สามารถทำให้เขียนได้ด้วยตัวเอง เลือกวิธีใดวิธีหนึ่ง:

- **รันแอปด้วย root** (แนะนำ) - ปล่อยผู้ใช้ของแอปไว้โดยไม่ตั้งค่า หรือตั้งเป็น `0` แล้วให้ entrypoint เริ่มต้นแก้ไขสิทธิ์และลดสิทธิ์เป็น `snapotter`
- **รันด้วย UID `999`** - ตั้งผู้ใช้/กลุ่มของแอปเป็น `999:999` (ผู้ใช้ `snapotter` ที่มีมาในตัว SnapOtter) เพื่อให้ตรงกับความเป็นเจ้าของของอิมเมจ
- **`chown` ชุดข้อมูลของโฮสต์** ไปยัง UID ที่คอนเทนเนอร์ใช้รัน จากเชลล์ของ TrueNAS:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

ข้อผิดพลาดตอนเริ่มต้นจะระบุ UID ที่ต้องใช้อย่างชัดเจน วิธีที่เร็วที่สุดคือเริ่มแอปหนึ่งครั้ง อ่านข้อความ แล้ว `chown` (หรือปรับผู้ใช้) ตามนั้น

## ตัวแปรสภาพแวดล้อม {#environment-variables}

| ตัวแปร | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|
| `AUTH_ENABLED` | `true` | เปิด/ปิดข้อกำหนดการเข้าสู่ระบบ |
| `DEFAULT_USERNAME` | `admin` | ชื่อผู้ใช้ผู้ดูแลระบบเริ่มต้น |
| `DEFAULT_PASSWORD` | `admin` | รหัสผ่านผู้ดูแลระบบเริ่มต้น (บังคับเปลี่ยนเมื่อเข้าสู่ระบบครั้งแรก) |
| `MAX_UPLOAD_SIZE_MB` | `0` (ไม่จำกัด) | ขีดจำกัดการอัปโหลดต่อไฟล์เป็น MB อิมเมจมาพร้อม `0` ส่วนการสร้างจากซอร์สเริ่มต้นที่ 100 |
| `MAX_BATCH_SIZE` | `0` (ไม่จำกัด) | จำนวนไฟล์สูงสุดต่อคำขอแบบชุด อิมเมจมาพร้อม `0` ส่วนการสร้างจากซอร์สเริ่มต้นที่ 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | คำขอ API ต่อนาทีต่อ IP (ตั้งเป็น 0 เพื่อปิด) |
| `MAX_USERS` | `0` (ไม่จำกัด) | จำนวนบัญชีผู้ใช้สูงสุด |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | เพียร์ใดบ้างที่กำหนด IP ของไคลเอนต์ผ่าน `X-Forwarded-For` ได้ ค่าเริ่มต้นคือเครือข่ายส่วนตัวเท่านั้น |
| `PUID` | `999` | รันด้วย UID นี้ (สำหรับสิทธิ์ของ bind mount) |
| `PGID` | `999` | รันด้วย GID นี้ (สำหรับสิทธิ์ของ bind mount) |
| `LOG_LEVEL` | `info` | ระดับความละเอียดของบันทึก: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (อัตโนมัติ) | จำนวนงานประมวลผล AI แบบขนานสูงสุด |
| `SESSION_DURATION_HOURS` | `168` | อายุเซสชันการเข้าสู่ระบบ (7 วัน) |
| `CORS_ORIGIN` | (ว่าง) | รายการ origin ที่อนุญาต คั่นด้วยจุลภาค หรือเว้นว่างสำหรับ origin เดียวกัน |

### พร็อกซีขาออกและ CA ส่วนตัว {#outbound-proxy-and-private-ca}

คอนเทนเนอร์อย่างเป็นทางการเปิดใช้การรองรับพร็อกซีผ่านสภาพแวดล้อมของ Node หาก SnapOtter ต้องเข้าถึงที่เก็บรันไทม์ OCR หรือบริการ HTTPS อื่นผ่านพร็อกซีขององค์กร ให้ตั้งค่า `HTTPS_PROXY` (และ `HTTP_PROXY` เมื่อจำเป็น) ตั้งค่า `NO_PROXY` เป็นรายการโฮสต์ที่คั่นด้วยจุลภาคซึ่งต้องเข้าถึงโดยตรง เช่น Postgres, Redis และพื้นที่จัดเก็บอ็อบเจ็กต์ภายใน

หากพร็อกซีหรือบริการภายในลงนามด้วยผู้ออกใบรับรองส่วนตัว ให้เมานต์ใบรับรอง CA แบบอ่านอย่างเดียวแล้วชี้ `NODE_EXTRA_CA_CERTS` ไปที่ไฟล์นั้น ไฟล์ต้องมีอยู่ตอนที่โปรเซส Node เริ่มทำงาน:

```yaml
services:
  app:
    environment:
      HTTPS_PROXY: http://proxy.example.internal:3128
      HTTP_PROXY: http://proxy.example.internal:3128
      NO_PROXY: postgres,redis,minio,localhost,127.0.0.1
      NODE_EXTRA_CA_CERTS: /etc/snapotter/custom-ca.pem
    volumes:
      - ./company-ca.pem:/etc/snapotter/custom-ca.pem:ro
```

เก็บข้อมูลรับรองของพร็อกซีไว้นอกไฟล์ Compose (เช่น ในไฟล์ `.env` ที่มีการป้องกันหรือ secret) อย่าปิดการตรวจสอบ TLS ดัชนี OCR ที่ลงนามไว้ใช้ยืนยันความถูกต้องของข้อมูลเมตาของรุ่น ขณะที่การตรวจสอบ TLS ตามปกติยังคงปกป้องการส่งข้อมูลและคำขอขาออกอื่นทั้งหมด

## การตรวจสอบสถานะ {#health-check}

คอนเทนเนอร์มีการตรวจสอบสถานะในตัว:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse Proxy {#reverse-proxy}

`TRUST_PROXY` มีค่าเริ่มต้นเป็น `loopback,linklocal,uniquelocal` ดังนั้น SnapOtter จะเชื่อ `X-Forwarded-For` เฉพาะจากเพียร์ในเครือข่ายส่วนตัวเท่านั้น reverse proxy บนโฮสต์เดียวกัน บนเครือข่าย Docker หรือบน LAN ของคุณจึงเชื่อถือได้ทันที ซึ่งหมายความว่าการจำกัดอัตรา ตัวจำกัดการเดารหัสผ่านตอนเข้าสู่ระบบ บันทึกการตรวจสอบ และรายการ IP ที่อนุญาตระดับองค์กร ล้วนเห็น IP ที่แท้จริงของไคลเอนต์โดยไม่ต้องตั้งค่าใดๆ

ตั้งค่า `TRUST_PROXY=true` เฉพาะเมื่อพร็อกซีด้านหน้าเข้าถึง SnapOtter จากที่อยู่ **สาธารณะ** เช่น โหลดบาลานเซอร์บนคลาวด์ในเครือข่ายอื่น บนอินสแตนซ์ที่เปิดให้เข้าถึงโดยตรง ค่านั้นทำให้ `request.ip` ถูกผู้โจมตีควบคุมได้ เพราะผู้เรียกที่สลับเฮดเดอร์จะได้บักเก็ตจำกัดอัตราใหม่ในทุกคำขอ

ข้อควรรู้สองข้อก่อนวัด IP ของไคลเอนต์ Docker Desktop บน macOS และ Windows ให้บริการพอร์ตที่เผยแพร่ผ่านพร็อกซีใน userland ซึ่งเขียนที่อยู่ต้นทางทุกรายการเป็นเกตเวย์ของ VM `192.168.65.1` ดังนั้นไม่มีค่า `TRUST_PROXY` ใดกู้คืน IP จริงของไคลเอนต์ที่นั่นได้ ให้ติดตั้งบน Linux สำหรับสิ่งที่เปิดสู่อินเทอร์เน็ต และบนทุกแพลตฟอร์ม การเข้าถึงพอร์ตที่เผยแพร่ผ่าน `localhost` จะถูกมองเห็นเป็นเกตเวย์ของบริดจ์ ไม่ใช่ไคลเอนต์ของคุณ ดังนั้นการทดสอบผ่าน localhost จึงบอกอะไรไม่ได้เกี่ยวกับวิธีระบุตัวไคลเอนต์จริง ตารางค่า `TRUST_PROXY` ทั้งหมดและข้อควรระวังของ Docker Desktop อยู่ใน [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy)

สองข้อที่สำคัญกับพร็อกซีทุกตัวด้านล่าง: อนุญาตเนื้อหาคำขอขนาดใหญ่ (การอัปโหลด) และอย่าบัฟเฟอร์การตอบกลับ พร็อกซีที่บัฟเฟอร์การตอบกลับจะทำให้ความคืบหน้าแบบ SSE เสียหาย และเห็นได้ชัดกว่านั้นคือทำให้การดาวน์โหลดไฟล์ขนาดใหญ่ "เริ่มแล้วไม่จบ" เพราะพร็อกซีถือไฟล์ทั้งไฟล์ไว้ก่อนส่งต่อ SnapOtter ส่ง `X-Accel-Buffering: no` ในการดาวน์โหลดเพื่อให้ nginx สตรีมได้แม้เปิดการบัฟเฟอร์ไว้ที่อื่น แต่พร็อกซีอื่นที่ไม่ใช่ nginx ต้องปิดการบัฟเฟอร์การตอบกลับอย่างชัดเจน (แสดงไว้ในแต่ละการกำหนดค่าด้านล่าง) หากการดาวน์โหลดค้างกลางทาง พร็อกซีที่บัฟเฟอร์อยู่ด้านหน้าเป็นสิ่งแรกที่ควรตรวจสอบ

หมายเหตุเกี่ยวกับ HSTS: API ส่ง `Strict-Transport-Security` ในทุกการตอบกลับด้วยตัวเอง ดังนั้นพร็อกซีที่ส่งผ่านเฮดเดอร์การตอบกลับ (ทุกการกำหนดค่าด้านล่างทำเช่นนั้น) ไม่ต้องตั้งค่า HSTS เพิ่มเอง ต้องรักษาเฮดเดอร์ไว้หรือเพิ่มกลับที่ขอบเครือข่ายก็ต่อเมื่อพร็อกซีของคุณถูกตั้งค่าให้ตัดหรือเขียนทับเฮดเดอร์การตอบกลับจากต้นทาง

### Nginx {#nginx}

```nginx
server {
    # Plain HTTP shown for brevity. Terminate TLS in your own `listen 443 ssl`
    # server block; the Strict-Transport-Security header the API sends passes
    # through with every proxied response, so no add_header is needed there.
    listen 80;
    server_name images.example.com;

    # Match MAX_UPLOAD_SIZE_MB (0 = nginx default 1M, so set high for unlimited)
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:1349;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Stream responses instead of buffering: needed for SSE progress
        # (batch, AI, feature installs) and for large file downloads.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### การติดตั้งใต้ subpath {#subpath}

หากต้องการให้บริการที่ `https://example.com/snapotter` ให้ตั้งค่า `BASE_PATH=/snapotter` ในสภาพแวดล้อมของคอนเทนเนอร์
SnapOtter แล้วรีสตาร์ท ไฟล์ Compose สำหรับ CPU และ GPU อย่างเป็นทางการ
ยังรับ `BASE_PATH` จากเชลล์ของคุณหรือไฟล์ `.env` ของ Compose ได้ด้วย อิมเมจเดียวกัน
ใช้ได้กับทุกเส้นทาง ไม่ต้องสร้างฟรอนต์เอนด์ใหม่

`BASE_PATH` รับส่วนที่คั่นด้วยสแลช ซึ่งประกอบด้วยตัวอักษร ตัวเลข `_` หรือ
`-` รวมถึงเส้นทางซ้อน เช่น `/apps/snapotter` สแลชท้ายเป็นทางเลือก
เว้นว่างไว้ (ค่าเริ่มต้น) หรือตั้งเป็น `/` สำหรับการติดตั้งที่ราก

ในบล็อกเซิร์ฟเวอร์ Nginx HTTPS ที่มีอยู่ของคุณ ให้ใช้:

```nginx
location = /snapotter {
    return 308 /snapotter/$is_args$args;
}
location /snapotter/ {
    proxy_pass http://localhost:1349;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 500M;
    proxy_buffering off;
    proxy_read_timeout 300s;
}
```

ตัวอย่างนี้คงคำนำหน้าไว้ พร็อกซีที่ตัด `/snapotter` ก่อน
ส่งต่อก็รองรับเช่นกัน การตรวจสอบสถานะภายในยังคงใช้
`/api/v1/health` ได้ สำหรับ OIDC หรือ SAML ให้ตั้งค่า
`EXTERNAL_URL=https://example.com/snapotter` และอัปเดต
URL เรียกกลับของผู้ให้บริการระบุตัวตนให้มี `/snapotter/api/auth/oidc/callback` หรือ
`/snapotter/api/auth/saml/callback` ตามลำดับ

สคริปต์ API ยังทำงานได้เหมือนเดิม: URL ในการตอบกลับของ API เช่น
`downloadUrl` ของเครื่องมือ จะขึ้นต้นด้วย `/api/` ไม่ว่า `BASE_PATH` จะเป็นค่าใด ให้ต่อ URL เหล่านั้นกับ
URL ฐานของอินสแตนซ์ของคุณ (`https://example.com/snapotter` + `/api/v1/download/...`)
แทนที่จะแปลงเทียบกับรากของโดเมน

เปิด UI ผ่าน URL ที่มีคำนำหน้า (`https://example.com/snapotter`) เบราว์เซอร์
ที่เข้ามาโดยไม่มีคำนำหน้าจะถูกส่งไปที่นั่นอัตโนมัติ คาดว่าเฉพาะคำขอ API
เท่านั้นที่เข้าถึงแอปโดยไม่มีคำนำหน้า หากบันทึกแสดง
`Requests arrive under /snapotter/ but BASE_PATH is empty` แสดงว่าพร็อกซีของคุณ
ส่งต่อคำนำหน้าที่ `BASE_PATH` ไม่ได้ประกาศไว้ ให้ตั้งค่า `BASE_PATH` เป็นค่านั้น
หรือตัดคำนำหน้าที่พร็อกซี

### Nginx Proxy Manager {#nginx-proxy-manager}

1. เพิ่ม Proxy Host ใหม่
2. ตั้งค่า Domain Name เป็นโดเมนของคุณ
3. ตั้งค่า Scheme เป็น `http`, Forward Hostname เป็น `SnapOtter` (หรือ IP ของคอนเทนเนอร์) และ Forward Port เป็น `1349`
4. เปิดการรองรับ WebSocket
5. ใต้ Advanced ให้เพิ่ม: `client_max_body_size 500M;` และ `proxy_buffering off;`

เฮดเดอร์ `Strict-Transport-Security` ของ API ผ่าน NPM ไปตามเดิม สวิตช์ HSTS ในแท็บ SSL เป็นทางเลือกเพิ่มเติม

### Traefik {#traefik}

```yaml
# Add these labels to the SnapOtter service in docker-compose.yml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.snapotter.rule=Host(`images.example.com`)"
  - "traefik.http.routers.snapotter.entrypoints=websecure"
  - "traefik.http.routers.snapotter.tls.certresolver=letsencrypt"
  - "traefik.http.services.snapotter.loadbalancer.server.port=1349"
  # Increase upload limit (default 2MB is too low)
  - "traefik.http.middlewares.snapotter-body.buffering.maxRequestBodyBytes=524288000"
  - "traefik.http.routers.snapotter.middlewares=snapotter-body"
```

Traefik ส่งต่อเฮดเดอร์การตอบกลับจากต้นทางโดยไม่เปลี่ยนแปลง เฮดเดอร์ `Strict-Transport-Security` ของ API จึงถึงเบราว์เซอร์โดยไม่ต้องใช้มิดเดิลแวร์ `headers` หากคุณรันมิดเดิลแวร์ที่เขียนเฮดเดอร์การตอบกลับอยู่แล้ว โปรดตรวจสอบว่ามันไม่แตะต้องเฮดเดอร์นั้น

### Caddy {#caddy}

```txt
images.example.com {
    reverse_proxy localhost:1349 {
        flush_interval -1
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }
}
```

`flush_interval -1` ปิดการบัฟเฟอร์การตอบกลับ ซึ่งจำเป็นสำหรับเหตุการณ์ความคืบหน้าแบบ SSE (การประมวลผลแบบชุด เครื่องมือ AI การติดตั้งฟีเจอร์) และเพื่อให้การดาวน์โหลดไฟล์ขนาดใหญ่สตรีมผ่านได้แทนที่จะค้าง การหมดเวลาที่ขยายออกช่วยให้การอัปโหลดไฟล์ขนาดใหญ่เสร็จสมบูรณ์โดย Caddy ไม่ปิดการเชื่อมต่อก่อนเวลา Caddy ยังส่งผ่านเฮดเดอร์ `Strict-Transport-Security` ของ API โดยไม่แตะต้อง จึงไม่ต้องใช้คำสั่ง `header` สำหรับ HSTS

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

หมายเหตุ: Cloudflare จำกัดการอัปโหลดที่ 100 MB ในแผนฟรี ให้ตั้งค่า `MAX_UPLOAD_SIZE_MB=100` ให้สอดคล้องกัน

ทันเนลส่งต่อเฮดเดอร์การตอบกลับของ API รวมถึง `Strict-Transport-Security` จึงไม่ต้องตั้งค่า HSTS ในแดชบอร์ด (การตั้งค่า HSTS ที่ขอบของ Cloudflare เองเป็นทางเลือกเพิ่มเติม)

## การแก้ไขปัญหา {#troubleshooting}

### "Postgres not reachable: EAI_AGAIN" หลังเริ่มต้นครั้งแรกล้มเหลว {#eai-again-after-failed-first-start}

หาก `docker compose up -d` ครั้งแรกสุดล้มเหลวกลางทาง (สาเหตุที่พบบ่อยคือพอร์ตถูกใช้งานอยู่) การลอง `up -d` ซ้ำแบบธรรมดาอาจเริ่มคอนเทนเนอร์แอปโดยไม่ได้เชื่อมต่อกับเครือข่าย compose แอปจะวนล้มเหลวและรีสตาร์ทด้วยข้อความ:

```
Postgres not reachable: EAI_AGAIN
```

ในขณะที่ `docker ps` แสดงว่า postgres ปกติดี ข้อผิดพลาดนั้นเป็นของจริงแต่ชี้ผิดคอนเทนเนอร์ เมื่อไม่มีเครือข่าย DNS ของโฮสต์ `postgres` จะแปลงค่าไม่ได้เลย และนโยบายการรีสตาร์ทก็เล่นความล้มเหลวเดิมซ้ำไปเรื่อยๆ

แก้สิ่งที่ทำให้การเริ่มต้นครั้งแรกล้มเหลว (โดยมากคือทำให้พอร์ตว่าง) แล้วบังคับให้สร้างคอนเทนเนอร์แอปใหม่เพื่อให้เชื่อมต่อกับเครือข่ายอีกครั้ง:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: เข้าถึงได้จากอุปกรณ์อื่นแต่เข้าจากพีซีเครื่องนั้นเองไม่ได้ {#windows-wsl2-loopback}

เมื่อ Docker รันภายใน WSL2 (การตั้งค่า Windows ที่พบบ่อย) สแตกอาจเข้าถึงได้จากทุกเครื่องในเครือข่ายของคุณ ขณะที่ `http://localhost:1349` หมดเวลาบนโฮสต์ Windows เอง แม้จะเปิดโหมดเครือข่ายแบบ mirrored ของ WSL แล้วก็ตาม พอร์ตไม่ปรากฏใน `netstat` ของ Windows และคอนเทนเนอร์ไม่ได้มีอะไรผิดปกติ

ให้เปิดแอปจากอุปกรณ์อื่น หรือจากภายในดิสโทรโดยใช้ที่อยู่ของมันเอง (`hostname -I` ในเชลล์ WSL) หากการส่งต่อ localhost ใช้ได้บน WSL เวอร์ชันของคุณ ให้ถือว่าเป็นโบนัส ไม่ใช่สิ่งที่ควรพึ่งพา

## CI/CD {#ci-cd}

ที่เก็บ GitHub มีเวิร์กโฟลว์สามรายการ:

- **ci.yml** - รันอัตโนมัติในทุก push และ PR ทำ lint ตรวจชนิด ทดสอบ สร้าง และตรวจสอบอิมเมจ Docker (โดยไม่ push)
- **release.yml** - เรียกใช้ด้วยตนเองผ่าน `workflow_dispatch` รัน semantic-release เพื่อสร้างแท็กเวอร์ชันและ GitHub release จากนั้นสร้างอิมเมจ Docker หลายสถาปัตยกรรม (amd64 + arm64) และ push ไปยัง Docker Hub (`snapotter/snapotter`) และ GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`)
- **deploy-docs.yml** - สร้างเว็บไซต์เอกสารนี้และปรับใช้ไปยัง Cloudflare Pages เมื่อ push ไปยัง `main`

หากต้องการสร้างรุ่น ให้ไปที่ **Actions > Release > Run workflow** ใน UI ของ GitHub หรือรัน:

```bash
gh workflow run release.yml
```

Semantic-release กำหนดเวอร์ชันจากประวัติ commit แท็ก Docker `latest` ชี้ไปยังรุ่นล่าสุดเสมอ

## การวิเคราะห์การใช้งาน {#analytics}

SnapOtter มีการวิเคราะห์ผลิตภัณฑ์แบบไม่ระบุตัวตน (รูปแบบการใช้เครื่องมือ รายงานข้อผิดพลาด) เพื่อช่วยจับข้อบกพร่องและปรับปรุงฟีเจอร์ โดยเปิดไว้เป็นค่าเริ่มต้น ไฟล์ ชื่อไฟล์ และข้อมูลส่วนบุคคลของคุณจะไม่ถูกรวมอยู่ในนั้นเด็ดขาด SnapOtter ทำงานได้ตามปกติเมื่อปิดการวิเคราะห์

### การปิดการวิเคราะห์ {#disabling-analytics}

การเลือกไม่เข้าร่วมระหว่างรันไทม์ทำได้ด้วยสวิตช์ของผู้ดูแลระบบเพียงคลิกเดียว เปิด Settings > System > Privacy แล้วปิด Anonymous Product Analytics การวิเคราะห์จะหยุดทันทีสำหรับทั้งอินสแตนซ์ โดยไม่ต้องสร้างใหม่

สำหรับอิมเมจที่ไม่มีทางส่งข้อมูลวิเคราะห์ได้เลย ให้ตั้งค่าปิดถาวรตอนสร้างโดยโคลนที่เก็บแล้วสร้างใหม่:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

หรือเพิ่ม build arg ให้กับ `docker-compose.yml` ที่มีอยู่ของคุณ:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
