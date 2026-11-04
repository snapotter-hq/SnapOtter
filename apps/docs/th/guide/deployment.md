---
description: "ติดตั้ง SnapOtter ใช้งานจริงด้วย Docker ความต้องการด้านฮาร์ดแวร์ การตั้งค่า GPU และการกำหนดค่า reverse proxy สำหรับ Nginx, Traefik และ Cloudflare"
i18n_source_hash: b8c4ed2cc086
i18n_provenance: machine
i18n_output_hash: 5a69649ddeae
i18n_hash_version: 2
---

# การติดตั้งใช้งาน {#deployment}

SnapOtter ติดตั้งเป็นสแต็ก Docker Compose แบบ 3 คอนเทนเนอร์ ได้แก่ อิมเมจแอป SnapOtter, PostgreSQL 17 และ Redis 8 อิมเมจแอปรองรับ **linux/amd64** (พร้อม NVIDIA CUDA สำหรับการเร่งความเร็ว AI) และ **linux/arm64** (CPU) จึงรันแบบเนทีฟได้บนเซิร์ฟเวอร์ Intel/AMD, Mac ที่ใช้ Apple Silicon และอุปกรณ์ ARM เช่น Raspberry Pi 4/5 การเร่งความเร็วด้วย iGPU ของ Intel/AMD ผ่าน VA-API, Quick Sync หรือ OpenCL ยังไม่รองรับสำหรับการอนุมาน AI ในปัจจุบัน

ดู [อิมเมจ Docker](./docker-tags) สำหรับการตั้งค่า GPU ตัวอย่าง Docker Compose และการตรึงเวอร์ชัน

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

จากนั้นแอปจะพร้อมใช้งานที่ `http://localhost:1349`

สแต็กข้างต้นเชื่อมต่อในฐานะเจ้าของฐานข้อมูล ตั้งแต่ SnapOtter 2.3.0 คุณสามารถให้บริการคำขอด้วยบทบาทที่อ่านและเขียนแถวได้เท่านั้น ดู [บทบาทสิทธิ์ขั้นต่ำ](./database#least-privilege-roles)

> **ติดขีดจำกัดอัตราของ Docker Hub?** แทนที่ `snapotter/snapotter:latest` ด้วย `ghcr.io/snapotter-hq/snapotter:latest` เพื่อดึงอิมเมจจาก GitHub Container Registry แทน ทั้งสองรีจิสทรีได้รับอิมเมจเดียวกันในทุกรุ่น

## เริ่มต้นอย่างรวดเร็ว (NVIDIA CUDA) {#quick-start-nvidia-cuda}

สำหรับการเร่งความเร็วด้วย NVIDIA CUDA บนเครื่องมือ AI ที่รองรับ (ลบพื้นหลัง ขยายภาพ ปรับปรุงใบหน้า):

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

หากเครื่องมือ AI ทำงานบน CPU ทั้งที่ตั้งค่า `--gpus all` และ NVIDIA Container Toolkit ถูกต้องแล้ว ให้ติดตั้งบันเดิลที่เกี่ยวข้องใหม่ (เช่น Background Removal) จาก **Settings → AI Features** ตัวติดตั้งจะคืนค่า ONNX Runtime รุ่น GPU ซึ่งอาจถูกบดบังโดยรุ่น CPU เท่านั้นที่บันเดิลอื่น (เช่น transcription) ดึงเข้ามาในสภาพแวดล้อม AI ที่ใช้ร่วมกัน หากการติดตั้งใหม่จาก UI ไม่คืน GPU บนอิมเมจรุ่นเก่า ให้ดูวิธีซ่อมแซมด้วยตนเองใน [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490)

## ความต้องการด้านฮาร์ดแวร์ {#hardware-requirements}

ตัวเลขเหล่านี้มาจากเบนช์มาร์กบนระบบหลากหลาย ตั้งแต่เวิร์กสเตชัน amd64 สมัยใหม่ที่มี NVIDIA RTX 4070 ไปจนถึง Raspberry Pi โดยรันแค็ตตาล็อกเครื่องมือทั้งหมดบนแต่ละเครื่อง และไล่ปรับขีดจำกัดทรัพยากรของ Docker เพื่อหาขั้นต่ำที่แท้จริง

รันที่ระดับเล็กของตารางนี้ (Pi, แล็ปท็อปเก่า, VPS 2 GB) ใช่ไหม [การตั้งค่าสำหรับทรัพยากรจำกัด](/th/guide/low-resource) แปลงตัวเลขเหล่านี้เป็นขั้นตอนที่ทำตามได้จริงพร้อมเพดานที่ปรับแต่งแล้ว

### ตารางอ้างอิงด่วน {#quick-reference}

| ระดับ | กรณีใช้งาน | CPU | RAM | GPU | พื้นที่จัดเก็บ |
|------|----------|-----|-----|-----|---------|
| ขั้นต่ำ | เครื่องมือที่ไม่ใช่ AI (ภาพ ไฟล์ PDF แบบเบา) พร้อม Fast OCR และการตรวจจับใบหน้าในตัว ผู้ใช้คนเดียว ชุดงานขนาดเล็ก | 2 คอร์ | 2 GB | ไม่มี | ~7 GB |
| แนะนำ | ทั้งห้าประเภท รวมวิดีโอ PDF และบันเดิล AI มาตรฐานบน CPU ชุดงาน ผู้ใช้ไม่กี่คน | 4 คอร์ | 4 GB (8 GB สำหรับ HQ inpainting) | ไม่มี | ~25 GB |
| เต็มรูปแบบ | ทุกอย่างด้วยความเร็วเต็มที่ รวม AI บน GPU ชุดงานขนาดใหญ่ ผู้ใช้จำนวนมาก | 6-8 คอร์ | 8 GB | NVIDIA VRAM 8 GB ขึ้นไป (12 GB สบาย ๆ) | ~35 GB |

**สถาปัตยกรรม: 64 บิตเท่านั้น** (`linux/amd64` หรือ `linux/arm64`) SnapOtter รันแบบเนทีฟบนเซิร์ฟเวอร์ Intel/AMD, Mac ที่ใช้ Apple Silicon และบอร์ด ARM 64 บิต รวมถึง **Raspberry Pi 4 และ 5** (4-8 GB) แต่**ไม่**รันบน ARM 32 บิต (`armv7`/`armhf`) เพราะไม่มีการสร้างอิมเมจสำหรับสถาปัตยกรรมนั้น และไม่รันบนบอร์ดระดับ 512 MB เช่น Pi Zero ซึ่งต่ำกว่าเกณฑ์หน่วยความจำขั้นต่ำ (ดูด้านล่าง)

### ขั้นต่ำ (เครื่องมือภาพ ไฟล์ และ PDF แบบเบา ไม่มี AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| ทรัพยากร | ความต้องการ |
|---|---|
| CPU | 2 คอร์ |
| RAM | 2 GB |
| ดิสก์ | ~5.5 GB (อิมเมจ) + วอลุ่มข้อมูล |
| GPU | ไม่จำเป็น |

เครื่องมือในแค็ตตาล็อกที่ไม่ใช่ AI ทั้ง 222 รายการ ได้แก่ ภาพ (ปรับขนาด ครอป แปลง บีบอัด ปรับแต่ง ลายน้ำ) วิดีโอ (ตัดช่วง ปิดเสียง remux) เสียง (แปลง ปรับระดับเสียง ตัดช่วง) PDF (รวม แยก บีบอัด หมุน ป้องกัน) การแปลงไฟล์ และพรีเซ็ตการแปลงเฉพาะ ทำงานได้บนฮาร์ดแวร์ระดับกลาง การทำงานส่วนใหญ่เสร็จเร็วกว่าหนึ่งวินาทีมาก แม้กับไฟล์ขนาดใหญ่ ภาพขนาด 2.7 MB ปรับขนาดได้ใน ~0.05 วินาที และเข้ารหัสใหม่เป็น WebP ใน ~2 วินาที

เกณฑ์หน่วยความจำขั้นต่ำเป็นเรื่องจริง จากการไล่ปรับขีดจำกัดทรัพยากรของ Docker: **512 MB ไม่สามารถเริ่มสแต็กได้** (แม้การปรับขนาดภาพเพียงครั้งเดียวก็ถูกปิด) **1 GB** รองรับการทำงานกับไฟล์เดียวได้ แต่ชุดงานหลายไฟล์จะหน่วยความจำหมด และ **2 GB / 2 คอร์** เป็นการตั้งค่าที่เล็กที่สุดที่รองรับชุดงานที่ไม่ใช่ AI ได้อย่างสบาย Fast OCR ในตัวและบันเดิล `face-detection` ก็อยู่ภายใน 2 GB ได้เช่นกัน ส่วนบันเดิล AI ที่ใหญ่กว่า (Whisper, LaMa/DDColor, rembg, RealESRGAN, การฟื้นฟูภาพถ่าย และ SD1.5 HQ inpainting) ต้องใช้ RAM 4 ถึง 8 GB และจะถูกปฏิเสธทันทีเมื่อหน่วยความจำว่างต่ำกว่าเกณฑ์ของแต่ละบันเดิล

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**ข้อยกเว้นเดียวที่ใช้ CPU หนักคือการเข้ารหัสวิดีโอใหม่** การทำงานแบบ stream-copy (ตัดช่วง ปิดเสียง remux คอนเทนเนอร์) เสร็จทันที แต่การทรานส์โค้ดเป็นโคเดกอื่นถูกจำกัดโดย CPU คลิป 1080p ยาว 45 วินาทีที่เข้ารหัสใหม่เป็น VP9 (WebM) ใช้เวลาประมาณ **~40 วินาที** บน CPU สมัยใหม่ที่เร็ว ~45 วินาทีบน Apple Silicon ~80 วินาทีบน 4 คอร์รุ่นมือถือที่เก่ากว่า และ **~130 วินาที** บนเซิร์ฟเวอร์ 4 คอร์รุ่นเก่า หากงานของคุณเน้นวิดีโอ ให้ให้ความสำคัญกับจำนวนคอร์ CPU และความเร็วสัญญาณนาฬิกา หรือเพิ่มขีดจำกัด `cpus:` ของคอนเทนเนอร์ โดย Compose ที่มาให้จำกัดแอปไว้ที่ 4 คอร์ตามค่าเริ่มต้น (8 คอร์ใน Compose สำหรับ GPU)

### แนะนำ (เครื่องมือ AI บน CPU) {#recommended-ai-tools-on-cpu}

| ทรัพยากร | ความต้องการ |
|---|---|
| CPU | 4 คอร์ |
| RAM | 4 GB |
| ดิสก์ | 3 GB (อิมเมจ) + ประมาณ 20 GB (แพ็ก AI เสริมทั้งหมด) + เวิร์กสเปซ |
| GPU | ไม่จำเป็น (ย้อนกลับไปใช้ CPU) |

**การติดตั้งและรันบันเดิล AI ขนาดใหญ่คือสิ่งที่ทำให้คำแนะนำสูงขึ้นเป็น RAM 4 GB** เมื่อไม่ได้ติดตั้งแพ็กเสริมใด แอปจะใช้หน่วยความจำขณะว่างราว 360 MB เครื่องมือ Python รุ่นเดิมใช้ sidecar ร่วมกัน ส่วน OCR แบบแม่นยำใช้ dispatcher แบบทำงานยาวเฉพาะที่ตรึงกับ generation ที่เปลี่ยนแปลงไม่ได้ซึ่งใช้งานอยู่ ก่อนเปิดใช้งาน ตัวติดตั้งจะรัน smoke test กับตัวเลือกใหม่ จากนั้นสลับไปยัง dispatcher ใหม่แบบอะตอมมิก และระบาย dispatcher ก่อนหน้าก่อนเก็บขยะ อาร์ติแฟกต์ OCR แบบแม่นยำที่เป็นทางการทุกตัวต้องผ่านชุดทดสอบกรณีเลวร้ายที่สุดก่อนปล่อยรุ่นภายใน cgroup ขนาด 4 GiB ขณะที่คำแนะนำโฮสต์ 4 GB เหลือที่ว่างให้แอปพลิเคชัน Node.js, Postgres, Redis, คิว และงานที่ทำพร้อมกัน

เครื่องมือ AI ส่วนใหญ่ใช้งานบน CPU ได้ดี มีอยู่ไม่กี่ตัวที่ต้องการ GPU จริง ๆ วัดบน CPU 4 คอร์สมัยใหม่:

| เครื่องมือ AI | เวลาบน CPU | ใช้งานบน CPU ได้หรือไม่ |
|---|---|---|
| ตรวจจับใบหน้า (blur-faces, smart-crop, red-eye), noise-removal | ไม่ถึง 1 วินาที | ได้ |
| OCR, ถอดเสียงเป็นข้อความ, คำบรรยาย | 1-3 วินาที | ได้ |
| ใส่สี, ปรับปรุงใบหน้า | ~10 วินาที | ได้ |
| ลบ / แทนที่ / เบลอพื้นหลัง | ~29 วินาที | ได้ (ต้องรอ) |
| ขยายภาพด้วย AI (RealESRGAN) | ~33 วินาทีสำหรับภาพเล็ก หลายนาทีสำหรับภาพใหญ่ | พอใช้ได้ แนะนำ GPU อย่างยิ่ง |
| ฟื้นฟูภาพถ่าย (ไปป์ไลน์เต็ม) | หลายนาที | ไม่ได้ ต้องใช้ GPU หรือ CPU หลายคอร์ที่เร็ว |

SnapOtter ตั้งใจไม่ฝังการดาวน์โหลดโมเดลเหล่านี้ไว้ในอิมเมจ Docker บันเดิล AI จะถูกดึงมาก็ต่อเมื่อผู้ดูแลระบบเปิดใช้เครื่องมือที่เกี่ยวข้อง เก็บไว้ในวอลุ่ม `/data/ai` ถาวร และใช้ร่วมกันโดยทุกเครื่องมือที่ขึ้นกับสแต็กโมเดลเดียวกัน วิธีนี้ทำให้อิมเมจคอนเทนเนอร์สุดท้ายมีขนาดเล็ก ขณะที่การติดตั้ง AI เต็มรูปแบบยังคงใช้พื้นที่ตามตัวเลขที่สูงกว่าด้านล่างได้

บางเครื่องมือขึ้นกับบันเดิลที่ใช้ร่วมกันมากกว่าหนึ่งตัว เช่น Passport Photo ต้องใช้ทั้ง `background-removal` และ `face-detection` หากติดตั้ง `background-removal` ไว้แล้ว การเปิดใช้ Passport Photo จะดาวน์โหลดเฉพาะบันเดิล `face-detection` ที่ขาดอยู่ การนำกลับมาใช้ซ้ำแบบเดียวกันนี้ใช้กับเครื่องมือ AI ทั้งหมด

พื้นที่จัดเก็บของแพ็ก AI เสริมและเกณฑ์ขั้นต่ำของหน่วยความจำ CPU (SnapOtter ตรวจสอบหน่วยความจำที่ว่างก่อนส่งงานไปยัง Python sidecar และปฏิเสธทันทีหากรันต่ำกว่าเกณฑ์หน่วยความจำว่างของบันเดิล):

| บันเดิล | ขนาดดิสก์ | เกณฑ์ขั้นต่ำของหน่วยความจำ CPU |
|---|---|---|
| ตรวจจับใบหน้า | 200-300 MB | RAM โฮสต์ 2 GB (ว่าง ~0.5 GB) |
| Transcription | ~600 MB | RAM โฮสต์ 4 GB (ว่าง ~2 GB) |
| Object eraser + Colorize | 1-2 GB | RAM โฮสต์ 4 GB (ว่าง ~2 GB) |
| Accurate OCR (`balanced`/`best`) | ดาวน์โหลด ~208-234 MiB / ติดตั้งแล้ว ~409-488 MiB | หน่วยความจำที่กำหนดใช้งานจริง 4 GiB (`fast` รันบน 2 GB ได้) |
| ลบพื้นหลัง | 4-5 GB | RAM โฮสต์ 4 GB (ว่าง ~2.5 GB) |
| Upscale + Face enhance + Noise removal | 5-6 GB | RAM โฮสต์ 4 GB (ว่าง ~2.5 GB) |
| ฟื้นฟูภาพถ่าย | 4-5 GB | RAM โฮสต์ 4 GB (ว่าง ~3 GB) |
| High-Quality Inpainting (`inpaint-hq`) | 5-7 GB | RAM โฮสต์ 8 GB (ว่าง ~6 GB) |
| **ทุกบันเดิล** | **ติดตั้งแล้ว ~25 GB** | **4 GB (8 GB เมื่อมี `inpaint-hq`)** |

Fast OCR ถูกสร้างไว้ในอิมเมจผ่าน Tesseract เพิ่มขนาดราว 25 MiB และไม่ต้องใช้แพ็ก OCR เสริมหรือหน่วยความจำ 4 GiB ของแพ็กนั้น Fast รองรับ `auto`, `en`, `de`, `es`, `fr`, `zh` และ `ja` แต่ไม่รองรับภาษาเกาหลี (`ko`) หรืออาหรับ (`ar`) ทั้งสองใช้ `balanced` หรือ `best` จึงต้องใช้แพ็กแบบแม่นยำ แพ็กแบบแม่นยำมีในคอนเทนเนอร์ Linux amd64 และ arm64 อย่างเป็นทางการ และรัน ONNX Runtime บน CPU โฮสต์ NVIDIA ใช้รันไทม์ OCR บน CPU ตัวเดียวกันนี้ ดังนั้น OCR จึงไม่ขึ้นกับเวอร์ชัน CUDA หรือสถาปัตยกรรม GPU รันไทม์แบบแม่นยำต้องการหน่วยความจำที่ใช้งานจริงอย่างน้อย 4 GiB คือขีดจำกัด cgroup ของคอนเทนเนอร์ที่ตั้งไว้ หรือหน่วยความจำของโฮสต์หากไม่ได้ตั้ง SnapOtter ปฏิเสธระบบที่ต่ำกว่าขั้นต่ำด้านความเข้ากันได้ที่ลงนามไว้นี้ก่อนดาวน์โหลดแพ็ก การติดตั้งแพ็กแบบแม่นยำยังถูกปฏิเสธบนอาร์ไคฟ์ bare-metal/สร้างไว้ล่วงหน้าที่ไม่สามารถรับประกัน libc และ Python ABI ได้ บนโฮสต์ที่ไม่รองรับเหล่านั้น OCR ภาษาเกาหลีและอาหรับจะคืนข้อผิดพลาดความไม่เข้ากันอย่างชัดเจน และจะไม่ย้อนกลับไปใช้ Fast อย่างเงียบ ๆ

เรพลิกาที่ใช้ `DATA_DIR` ร่วมกันต้องใช้สถาปัตยกรรม CPU เดียวกัน ให้ตรึงการติดตั้งแบบหลายเรพลิกาด้วย node affinity เรพลิกา amd64/arm64 ที่ปะปนกันต้องใช้วอลุ่มข้อมูลแยกกันและการติดตั้ง SnapOtter ที่เป็นอิสระต่อกัน

รันไทม์แบบแม่นยำเก็บ generation ที่ใช้งานไว้เพียงหนึ่งตัวและล้างแคชดาวน์โหลดหลังการเปิดใช้งาน สำหรับรุ่นนี้ การติดตั้งครั้งแรกต้องใช้พื้นที่ชั่วคราวราว 620-720 MiB สำหรับอาร์ไคฟ์พร้อมพื้นที่เตรียมการ และการอัปเกรดอาจพุ่งสูงสุดใกล้ 1.2 GiB ขณะที่ generation เดิมยังคงใช้งานอยู่ ตัวติดตั้งคำนวณความต้องการที่แน่นอนจากดัชนีที่ลงนามและ generation ปัจจุบันก่อนดาวน์โหลดหรือแตกไฟล์ และล้มเหลวตั้งแต่ต้นหากวอลุ่มข้อมูลเล็กเกินไป

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
| ดิสก์ | ~35 GB รวม |

NVIDIA GPU (CUDA) เร่งโมเดล AI ที่หนักได้อย่างมาก วัดบน RTX 4070 เทียบกับ CPU สมัยใหม่:

| เครื่องมือ AI | ความเร็วที่เพิ่มขึ้นด้วย GPU | หมายเหตุ |
|---|---|---|
| ขยายภาพด้วย AI (RealESRGAN 2×) | **~47×** | ผลดีที่สุด ไม่ถึงหนึ่งวินาที เทียบกับ ~33 วินาที (หลายนาทีสำหรับภาพใหญ่) |
| ปรับปรุงใบหน้า (CodeFormer) | **~12×** | ~0.9 วินาที เทียบกับ ~11 วินาที |
| ถอดเสียงเป็นข้อความ (Whisper) | ~4.5× | |
| ลบ / แทนที่ / เบลอพื้นหลัง | ~4× | ~7 วินาทีบน GPU เทียบกับ ~29 วินาทีบน CPU |
| ใส่สี | ~1.8× | |
| OCR, ตรวจจับใบหน้า, red-eye, noise-removal | ~1× | เร็วอยู่แล้วบน CPU GPU ไม่ช่วย |
| ฟื้นฟูภาพถ่าย | ไม่มี | ถูกจำกัดด้วย CPU แม้มี GPU (การใช้ GPU 0%) CPU ที่เร็วสำคัญกว่า GPU ในกรณีนี้ |

เครื่องมือที่คุ้มค่ากับ GPU คือ **การขยายภาพ การปรับปรุงใบหน้า การถอดเสียงเป็นข้อความ และการลบพื้นหลัง** การตรวจจับใบหน้า OCR และ red-eye ถูกจำกัดด้วย CPU และเร็วอยู่แล้ว GPU จึงไม่ช่วยเพิ่มอะไร

การใช้ VRAM สูงสุดถึง 7.5 GB ระหว่างการขยายภาพพร้อมการปรับปรุงใบหน้า GPU NVIDIA ขนาด 6 GB ใช้ได้กับเครื่องมือ AI ส่วนใหญ่เมื่อใช้ทีละตัว แต่จะล้มเหลวกับการขยายภาพ VRAM 8-12 GB รองรับได้ทุกอย่าง

การเร่งความเร็วด้วย iGPU ของ Intel/AMD ผ่าน VA-API, Quick Sync หรือ OpenCL ยังไม่รองรับสำหรับการอนุมาน AI ในปัจจุบัน การแมป `/dev/dri` เข้าไปในคอนเทนเนอร์ไม่ได้เปิดใช้การเร่งความเร็ว AI ด้วย GPU SnapOtter จะรันเครื่องมือ AI บน CPU เว้นแต่จะมี NVIDIA CUDA

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
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

เวลาตอบสนองเพิ่มขึ้นแบบต่ำกว่าเชิงเส้นโดยไม่มีข้อผิดพลาด เมื่อเวิร์กเกอร์พูลเริ่มเต็ม การเพิ่มขีดจำกัด `cpus:` ของคอนเทนเนอร์แอป (หรือใช้โฮสต์ที่มีคอร์มากกว่า) จะยกเพดานขึ้น โปรดทราบว่างานหนัก (ทรานส์โค้ดวิดีโอ AI บน CPU) จะยึดเวิร์กเกอร์ไว้ตลอดระยะเวลาของงาน ดังนั้นให้กำหนดขนาด CPU ตามจำนวนงานหนักที่คาดว่าจะทำพร้อมกัน ไม่ใช่เพียงจำนวนคำขอ

### รูปแบบภาพที่รองรับ {#supported-image-formats}

SnapOtter รองรับ**รูปแบบอินพุตกว่า 55 รูปแบบ**และ**รูปแบบเอาต์พุต 14 รูปแบบ** รวมถึงไฟล์ RAW จากแบรนด์กล้องกว่า 20 แบรนด์ รูปแบบมืออาชีพ (PSD, EPS, OpenEXR, HDR) โคเดกสมัยใหม่ (JPEG XL, AVIF, HEIC, QOI) และรูปแบบด้านวิทยาศาสตร์/เกม (FITS, DDS)

ดู[รายการรูปแบบทั้งหมด](/th/guide/supported-formats) สำหรับรายละเอียดของทุกรูปแบบที่รองรับ ตัวถอดรหัสที่ใช้ และตัวควบคุมคุณภาพที่มี

### ข้อจำกัดที่ทราบ {#known-limitations}

- **การปรับขนาดแบบรับรู้เนื้อหา** ขัดข้องกับภาพขนาดใหญ่ (>5 MP) เนื่องจากข้อจำกัดของไบนารี caire ใช้งานได้ปกติกับภาพที่เล็กกว่า
- **การถอดรหัส HEIF** ใช้เวลา 13-23 วินาที ส่วน HEIC (รุ่นของ Apple) เร็วกว่ามากที่ 0.3-0.9 วินาที
- **การขยายภาพ** หมดเวลาบน CPU สำหรับภาพที่ใหญ่กว่าขนาดเล็ก ต้องใช้ GPU จึงจะใช้งานได้จริง
- **การปรับปรุงใบหน้าด้วย CodeFormer** ช้ากว่า GFPGAN อย่างมาก (53 วินาที เทียบกับ 2 วินาทีบน GPU) แนะนำ GFPGAN สำหรับกรณีใช้งานส่วนใหญ่

## วอลุ่ม {#volumes}

| จุดเมานต์ / วอลุ่ม | วัตถุประสงค์ | จำเป็นหรือไม่ |
|---|---|---|
| `/data` (app) | โมเดล AI, Python venv, ไฟล์ของผู้ใช้ | **จำเป็น** ไฟล์จะสูญหายหากไม่มี |
| `/tmp/workspace` (app) | ไฟล์ประมวลผลชั่วคราว (ล้างอัตโนมัติ) | แนะนำ |
| `SnapOtter-pgdata` (postgres) | ไดเรกทอรีข้อมูล PostgreSQL (ผู้ใช้ การตั้งค่า ไปป์ไลน์ งาน) | **จำเป็น** ข้อมูลจะสูญหายหากไม่มี |
| `SnapOtter-redisdata` (redis) | ไฟล์ append-only ของ Redis สำหรับคิวงานที่คงทน | แนะนำ |

### Bind mount เทียบกับ named volume {#bind-mounts-vs-named-volumes}

**Named volume** (แนะนำ) Docker จัดการสิทธิ์ให้โดยอัตโนมัติ:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mount** คุณจัดการสิทธิ์เอง ตั้งค่า `PUID`/`PGID` ให้ตรงกับผู้ใช้โฮสต์ของคุณ:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### สิทธิ์การเข้าถึงที่เก็บข้อมูล {#storage-permissions}

SnapOtter เขียนลงสองตำแหน่งขณะรัน คือ `/data` (ไฟล์ผู้ใช้ บันทึก โมเดล AI และ Python venv) และ `/tmp/workspace` (พื้นที่ทำงานชั่วคราวสำหรับประมวลผล) ทั้งสองต้องเขียนได้โดยผู้ใช้ที่คอนเทนเนอร์รันอยู่ หากไม่ใช่ คอนเทนเนอร์จะ**ล้มเหลวทันทีตอนเริ่มต้น** พร้อมข้อความที่ระบุไดเรกทอรี UID/GID ที่กำลังรัน และวิธีแก้ไข แทนที่จะบูตขึ้นมาด้วยสถานะ "healthy" แล้วล้มเหลวตอนอัปโหลดครั้งแรกด้วยข้อผิดพลาดที่เข้าใจยาก ไดเรกทอรีบันทึก (`LOG_DIR`, `/data/logs` ในอิมเมจ) ถูกตรวจสอบแบบเดียวกันในทุกโหมดการจัดเก็บ เพราะบันทึกอยู่ในเครื่องเสมอ แม้ไฟล์จะอยู่ใน S3

วิธีจัดการสิทธิ์ขึ้นอยู่กับวิธีที่คอนเทนเนอร์ถูกเรียกใช้:

**ค่าเริ่มต้น (เริ่มด้วย root แล้วลดสิทธิ์เป็น `snapotter`)** entrypoint เริ่มด้วย root แก้ไขความเป็นเจ้าของของวอลุ่มที่เมานต์ แล้วลดสิทธิ์เป็นผู้ใช้ `snapotter` ที่ไม่มีสิทธิ์พิเศษผ่าน `gosu` Named volume ใช้งานได้โดยไม่ต้องกำหนดค่า สำหรับ bind mount ให้ตั้งค่า `PUID`/`PGID` เป็นผู้ใช้โฮสต์ของคุณ (ด้านบน) เพื่อให้ไฟล์ที่เขียนเป็นของคุณ

**Kubernetes / OpenShift (ไม่ใช่ root ผ่าน `runAsUser`)** เมื่อเรียกใช้โดยตรงในฐานะผู้ใช้ที่ไม่ใช่ root คอนเทนเนอร์ไม่สามารถ chown วอลุ่มเองได้ ผู้ประสานงาน (orchestrator) จึงต้องทำให้เขียนได้ ตั้งค่า `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

ไดเรกทอรีที่เขียนได้ของอิมเมจเป็นของกลุ่ม GID 0 และกลุ่มเขียนได้ ดังนั้น pod ที่รันด้วย **UID ใดก็ได้** ร่วมกับกลุ่มเสริม root (ค่าเริ่มต้นของ OpenShift) จึงเขียนได้โดยไม่ต้องมี `chown`

**TrueNAS Scale (และการตั้งค่า "UID ต่างถิ่น" อื่น ๆ)** TrueNAS รันแอปในฐานะผู้ใช้ที่ไม่ใช่ root (มักเป็น `568:568`) และเมานต์ dataset ของโฮสต์ที่เป็นของผู้ใช้อื่น ดังนั้นทั้ง entrypoint และ `fsGroup` จึงทำให้เขียนได้ด้วยตัวเองไม่ได้ เลือกหนึ่งวิธี:

- **รันแอปในฐานะ root** (แนะนำ) ปล่อยผู้ใช้ของแอปไว้โดยไม่ตั้งค่า หรือตั้งเป็น `0` แล้วให้ entrypoint ค่าเริ่มต้นแก้ไขสิทธิ์และลดสิทธิ์เป็น `snapotter`
- **รันด้วย UID `999`** ตั้งค่าผู้ใช้/กลุ่มของแอปเป็น `999:999` (ผู้ใช้ `snapotter` ที่มีมาในตัวของ SnapOtter) เพื่อให้ตรงกับความเป็นเจ้าของของอิมเมจ
- **`chown` dataset ของโฮสต์** ให้เป็น UID ที่คอนเทนเนอร์รันอยู่ จากเชลล์ของ TrueNAS:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

ข้อผิดพลาดตอนเริ่มต้นระบุ UID ที่ต้องใช้อย่างชัดเจน ดังนั้นวิธีที่เร็วที่สุดคือเริ่มแอปหนึ่งครั้ง อ่านข้อความ แล้ว `chown` (หรือปรับผู้ใช้) ตามนั้น

## ตัวแปรสภาพแวดล้อม {#environment-variables}

| ตัวแปร | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|
| `AUTH_ENABLED` | `true` | เปิด/ปิดข้อกำหนดการเข้าสู่ระบบ |
| `DEFAULT_USERNAME` | `admin` | ชื่อผู้ใช้ผู้ดูแลระบบเริ่มต้น |
| `DEFAULT_PASSWORD` | `admin` | รหัสผ่านผู้ดูแลระบบเริ่มต้น (บังคับเปลี่ยนเมื่อเข้าสู่ระบบครั้งแรก) |
| `MAX_UPLOAD_SIZE_MB` | `0` (ไม่จำกัด) | ขีดจำกัดการอัปโหลดต่อไฟล์เป็น MB อิมเมจตั้งค่ามาเป็น `0` ส่วนการสร้างจากซอร์สเริ่มที่ 100 |
| `MAX_BATCH_SIZE` | `0` (ไม่จำกัด) | จำนวนไฟล์สูงสุดต่อคำขอแบบชุด อิมเมจตั้งค่ามาเป็น `0` ส่วนการสร้างจากซอร์สเริ่มที่ 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | คำขอ API ต่อนาทีต่อ IP (ตั้งเป็น 0 เพื่อปิด) |
| `MAX_USERS` | `0` (ไม่จำกัด) | จำนวนบัญชีผู้ใช้สูงสุด |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | เพียร์ที่อนุญาตให้ตั้ง IP ของไคลเอนต์ผ่าน `X-Forwarded-For` ค่าเริ่มต้นเฉพาะเครือข่ายส่วนตัว |
| `PUID` | `999` | รันด้วย UID นี้ (สำหรับสิทธิ์ bind mount) |
| `PGID` | `999` | รันด้วย GID นี้ (สำหรับสิทธิ์ bind mount) |
| `LOG_LEVEL` | `info` | ระดับความละเอียดของบันทึก: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (อัตโนมัติ) | จำนวนงานประมวลผล AI แบบขนานสูงสุด |
| `SESSION_DURATION_HOURS` | `168` | อายุเซสชันการเข้าสู่ระบบ (7 วัน) |
| `CORS_ORIGIN` | (ว่าง) | origin ที่อนุญาต คั่นด้วยจุลภาค หรือปล่อยว่างสำหรับ same-origin |

### พร็อกซีขาออกและ CA ส่วนตัว {#outbound-proxy-and-private-ca}

คอนเทนเนอร์อย่างเป็นทางการเปิดใช้การรองรับพร็อกซีจากสภาพแวดล้อมของ Node หาก SnapOtter ต้องเข้าถึงรีโพซิทอรีรันไทม์ OCR หรือบริการ HTTPS อื่นผ่านพร็อกซีขององค์กร ให้ตั้งค่า `HTTPS_PROXY` (และ `HTTP_PROXY` เมื่อจำเป็น) ตั้งค่า `NO_PROXY` เป็นรายการโฮสต์ที่คั่นด้วยจุลภาคซึ่งต้องเข้าถึงโดยตรง เช่น Postgres, Redis และอ็อบเจกต์สตอเรจภายใน

หากพร็อกซีหรือบริการภายในลงนามด้วย certificate authority ส่วนตัว ให้เมานต์ใบรับรอง CA แบบอ่านอย่างเดียว แล้วชี้ `NODE_EXTRA_CA_CERTS` ไปที่ไฟล์นั้น ไฟล์ต้องมีอยู่ก่อนโพรเซส Node เริ่มทำงาน:

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

เก็บข้อมูลประจำตัวของพร็อกซีไว้นอกไฟล์ Compose (เช่น ในไฟล์ `.env` ที่มีการป้องกันหรือ secret) อย่าปิดการตรวจสอบ TLS ดัชนี OCR ที่ลงนามจะยืนยันความถูกต้องของเมทาดาทาของรุ่น ส่วนการตรวจสอบ TLS ตามปกติยังคงปกป้องการส่งข้อมูลและคำขอขาออกอื่นทั้งหมด

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

`TRUST_PROXY` มีค่าเริ่มต้นเป็น `loopback,linklocal,uniquelocal` ดังนั้น SnapOtter จะเชื่อ `X-Forwarded-For` เฉพาะจากเพียร์บนเครือข่ายส่วนตัว reverse proxy บนโฮสต์เดียวกัน บนเครือข่าย Docker หรือบน LAN ของคุณจึงได้รับความเชื่อถือทันที ซึ่งหมายความว่าการจำกัดอัตรา ตัวจำกัดการเดารหัสผ่านตอนเข้าสู่ระบบ บันทึกการตรวจสอบ และรายการ IP ที่อนุญาตของ enterprise ล้วนเห็น IP ของไคลเอนต์ที่แท้จริงโดยไม่ต้องกำหนดค่า

ตั้งค่า `TRUST_PROXY=true` เฉพาะเมื่อพร็อกซีด้านหน้าเข้าถึง SnapOtter จากที่อยู่**สาธารณะ** เช่น load balancer บนคลาวด์ที่อยู่คนละเครือข่าย บนอินสแตนซ์ที่เปิดเผยโดยตรง ค่านั้นจะทำให้ `request.ip` ถูกผู้โจมตีควบคุมได้ เพราะผู้เรียกที่หมุนเวียนเฮดเดอร์จะได้บักเก็ตจำกัดอัตราใหม่ในทุกคำขอ

สองเรื่องที่ควรรู้ก่อนไปวัด IP ของไคลเอนต์ ประการแรก Docker Desktop บน macOS และ Windows ให้บริการพอร์ตที่เผยแพร่ผ่านพร็อกซีใน userland ซึ่งเขียนที่อยู่ต้นทางทุกตัวใหม่เป็นเกตเวย์ของ VM `192.168.65.1` ดังนั้นไม่ว่า `TRUST_PROXY` จะมีค่าใดก็กู้ไคลเอนต์ที่แท้จริงในกรณีนั้นไม่ได้ ให้ติดตั้งบน Linux สำหรับสิ่งที่เปิดสู่อินเทอร์เน็ต ประการที่สอง บนทุกแพลตฟอร์ม การเข้าถึงพอร์ตที่เผยแพร่ผ่าน `localhost` จะถูกมองเห็นเป็นเกตเวย์ของบริดจ์ ไม่ใช่ไคลเอนต์ของคุณ ดังนั้นการทดสอบด้วย localhost จึงไม่บอกอะไรเกี่ยวกับวิธีที่ไคลเอนต์จริงถูกระบุตัว ตารางค่า `TRUST_PROXY` ทั้งหมดและข้อควรระวังของ Docker Desktop อยู่ใน [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy)

สองเรื่องสำคัญสำหรับทุกพร็อกซีด้านล่าง คืออนุญาตเนื้อหาคำขอขนาดใหญ่ (การอัปโหลด) และอย่าบัฟเฟอร์การตอบกลับ พร็อกซีที่บัฟเฟอร์การตอบกลับจะทำให้ความคืบหน้าแบบ SSE เสีย และที่เห็นชัดกว่าคือทำให้การดาวน์โหลดไฟล์ขนาดใหญ่ "เริ่มแล้วไม่เสร็จ" เพราะพร็อกซีถือไฟล์ทั้งไฟล์ไว้ก่อนส่งต่อ SnapOtter ส่ง `X-Accel-Buffering: no` ในการดาวน์โหลด เพื่อให้ nginx สตรีมได้แม้เปิดการบัฟเฟอร์ไว้ที่อื่น แต่พร็อกซีอื่นที่ไม่ใช่ nginx ต้องปิดการบัฟเฟอร์การตอบกลับอย่างชัดเจน (แสดงในแต่ละการกำหนดค่าด้านล่าง) หากการดาวน์โหลดค้างกลางทาง พร็อกซีที่บัฟเฟอร์อยู่ด้านหน้าเป็นสิ่งแรกที่ควรตรวจสอบ

หมายเหตุเกี่ยวกับ HSTS: API ส่ง `Strict-Transport-Security` ในทุกการตอบกลับเอง ดังนั้นพร็อกซีที่ส่งผ่านเฮดเดอร์การตอบกลับ (ทุกการกำหนดค่าด้านล่างเป็นเช่นนั้น) จึงไม่ต้องตั้งค่า HSTS เพิ่มเอง เฉพาะเมื่อพร็อกซีของคุณถูกกำหนดค่าให้ตัดหรือเขียนทับเฮดเดอร์การตอบกลับจากต้นทางเท่านั้น จึงจำเป็นต้องรักษาเฮดเดอร์นั้นไว้หรือเพิ่มกลับที่ edge

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

### การติดตั้งใช้งานภายใต้ subpath {#subpath}

หากต้องการให้บริการที่ `https://example.com/snapotter` ให้ตั้งค่า `BASE_PATH=/snapotter` ใน
สภาพแวดล้อมของคอนเทนเนอร์ SnapOtter แล้วรีสตาร์ท ไฟล์ Compose อย่างเป็นทางการสำหรับ CPU และ GPU
ก็รับ `BASE_PATH` จากเชลล์ของคุณหรือไฟล์ `.env` ของ Compose เช่นกัน อิมเมจเดียวกัน
ใช้ได้ที่ทุกพาธ ไม่ต้องสร้าง frontend ใหม่

`BASE_PATH` รับเซกเมนต์ที่คั่นด้วยเครื่องหมายทับซึ่งมีตัวอักษร ตัวเลข `_` หรือ
`-` รวมถึงพาธซ้อนกัน เช่น `/apps/snapotter` เครื่องหมายทับท้ายจะมีหรือไม่ก็ได้
ปล่อยว่างไว้ (ค่าเริ่มต้น) หรือตั้งค่า `/` สำหรับการติดตั้งที่ราก

ในบล็อกเซิร์ฟเวอร์ Nginx HTTPS เดิมของคุณ ให้ใช้:

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

ตัวอย่างนี้คงคำนำหน้าไว้ พร็อกซีที่ตัด `/snapotter` ออกก่อน
ส่งต่อก็รองรับเช่นกัน การตรวจสอบสถานะภายในยังคงใช้
`/api/v1/health` ได้ สำหรับ OIDC หรือ SAML ให้ตั้งค่า
`EXTERNAL_URL=https://example.com/snapotter` ด้วย และอัปเดต
callback URL ของผู้ให้บริการยืนยันตัวตนให้มี `/snapotter/api/auth/oidc/callback` หรือ
`/snapotter/api/auth/saml/callback` ตามลำดับ

สคริปต์ API ยังคงใช้งานได้โดยไม่ต้องแก้ไข URL ในการตอบกลับของ API เช่น
`downloadUrl` ของเครื่องมือ จะขึ้นต้นด้วย `/api/` ไม่ว่า `BASE_PATH` จะเป็นอะไร ให้ต่อท้าย URL ฐานของ
อินสแตนซ์ของคุณ (`https://example.com/snapotter` + `/api/v1/download/...`)
แทนที่จะแปลงเทียบกับรากของโดเมน

เปิด UI ผ่าน URL ที่มีคำนำหน้า (`https://example.com/snapotter`) เบราว์เซอร์
ที่เข้ามาโดยไม่มีคำนำหน้าจะถูกส่งไปที่นั่นโดยอัตโนมัติ มีเพียงคำขอ API
เท่านั้นที่คาดว่าจะเข้าถึงแอปโดยไม่มีคำนำหน้า หากบันทึกแสดง
`Requests arrive under /snapotter/ but BASE_PATH is empty` แสดงว่าพร็อกซีของคุณ
ส่งต่อคำนำหน้าที่ `BASE_PATH` ไม่ได้ประกาศไว้ ให้ตั้งค่า `BASE_PATH` เป็นคำนำหน้านั้น
หรือตัดคำนำหน้าออกที่พร็อกซี

### Nginx Proxy Manager {#nginx-proxy-manager}

1. เพิ่ม Proxy Host ใหม่
2. ตั้งค่า Domain Name เป็นโดเมนของคุณ
3. ตั้งค่า Scheme เป็น `http`, Forward Hostname เป็น `SnapOtter` (หรือ IP ของคอนเทนเนอร์), Forward Port เป็น `1349`
4. เปิดใช้การรองรับ WebSocket
5. ใต้ Advanced ให้เพิ่ม: `client_max_body_size 500M;` และ `proxy_buffering off;`

เฮดเดอร์ `Strict-Transport-Security` ของ API ผ่าน NPM ไปตามที่เป็น ส่วนสวิตช์ HSTS ในแท็บ SSL เป็นทางเลือกเพิ่มเติม

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

Traefik ส่งต่อเฮดเดอร์การตอบกลับจากต้นทางโดยไม่เปลี่ยนแปลง ดังนั้นเฮดเดอร์ `Strict-Transport-Security` ของ API จึงถึงเบราว์เซอร์โดยไม่ต้องมีมิดเดิลแวร์ `headers` หากคุณรันมิดเดิลแวร์ที่เขียนเฮดเดอร์การตอบกลับใหม่อยู่แล้ว ให้แน่ใจว่ามันไม่แตะต้องเฮดเดอร์นั้น

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

`flush_interval -1` ปิดการบัฟเฟอร์การตอบกลับ ซึ่งจำเป็นสำหรับเหตุการณ์ความคืบหน้าแบบ SSE (การประมวลผลเป็นชุด เครื่องมือ AI การติดตั้งฟีเจอร์) และเพื่อให้การดาวน์โหลดไฟล์ขนาดใหญ่สตรีมผ่านไปได้ แทนที่จะค้าง การขยายเวลาหมดอายุช่วยให้การอัปโหลดไฟล์ขนาดใหญ่เสร็จสิ้นโดยที่ Caddy ไม่ปิดการเชื่อมต่อก่อนเวลา Caddy ยังส่งผ่านเฮดเดอร์ `Strict-Transport-Security` ของ API โดยไม่แตะต้อง จึงไม่ต้องใช้ directive `header` สำหรับ HSTS

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

หมายเหตุ: Cloudflare จำกัดการอัปโหลดที่ 100 MB บนแผนฟรี ให้ตั้งค่า `MAX_UPLOAD_SIZE_MB=100` ให้สอดคล้องกัน

ทันเนลส่งต่อเฮดเดอร์การตอบกลับของ API รวมถึง `Strict-Transport-Security` จึงไม่ต้องกำหนดค่า HSTS ในแดชบอร์ด (การตั้งค่า HSTS ที่ edge ของ Cloudflare เองเป็นทางเลือกเพิ่มเติม)

## การแก้ไขปัญหา {#troubleshooting}

### "Postgres not reachable: EAI_AGAIN" ทันทีหลังการเริ่มต้นครั้งแรกที่ล้มเหลว {#eai-again-after-failed-first-start}

หาก `docker compose up -d` ครั้งแรกสุดล้มเหลวกลางทาง (สาเหตุที่พบบ่อยคือพอร์ตถูกใช้อยู่แล้ว) การลอง `up -d` ซ้ำแบบธรรมดาอาจเริ่มคอนเทนเนอร์แอปโดยไม่ได้เชื่อมต่อกับเครือข่าย compose แอปจะขัดข้องวนซ้ำพร้อมข้อความ:

```
Postgres not reachable: EAI_AGAIN
```

ในขณะที่ `docker ps` แสดงว่า postgres ปกติดี ข้อผิดพลาดนี้เป็นเรื่องจริงแต่ชี้ไปที่คอนเทนเนอร์ผิดตัว เมื่อไม่มีเครือข่าย DNS ของชื่อโฮสต์ `postgres` จะแก้ไขไม่ได้เลย และนโยบายการรีสตาร์ทก็เล่นความล้มเหลวเดิมซ้ำไปเรื่อย ๆ

แก้สิ่งที่ทำให้การเริ่มต้นครั้งแรกล้มเหลว (โดยปกติคือเคลียร์พอร์ต) แล้วบังคับให้สร้างคอนเทนเนอร์แอปใหม่เพื่อให้เชื่อมต่อกับเครือข่ายอีกครั้ง:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: เข้าถึงได้จากอุปกรณ์อื่น แต่เข้าจากพีซีเครื่องนั้นเองไม่ได้ {#windows-wsl2-loopback}

เมื่อ Docker รันอยู่ใน WSL2 (การตั้งค่าปกติบน Windows) สแต็กอาจเข้าถึงได้จากเครื่องอื่นทุกเครื่องบนเครือข่ายของคุณ ขณะที่ `http://localhost:1349` หมดเวลาบนโฮสต์ Windows เอง แม้จะเปิดโหมดเครือข่ายแบบ mirrored ของ WSL แล้วก็ตาม พอร์ตจะไม่ปรากฏใน `netstat` ของ Windows และคอนเทนเนอร์ไม่ได้มีอะไรผิดปกติ

เปิดแอปจากอุปกรณ์อื่น หรือจากภายในดิสโทรโดยใช้ที่อยู่ของมันเอง (`hostname -I` ในเชลล์ WSL) หาก localhost forwarding ใช้งานได้บน WSL เวอร์ชันของคุณ ให้ถือเป็นโบนัส ไม่ใช่สิ่งที่ควรพึ่งพา

## CI/CD {#ci-cd}

รีโพซิทอรี GitHub มีสาม workflow:

- **ci.yml** รันอัตโนมัติในทุกการ push และ PR ทำ lint, typecheck, ทดสอบ, สร้าง และตรวจสอบอิมเมจ Docker (โดยไม่ push)
- **release.yml** เรียกใช้ด้วยตนเองผ่าน `workflow_dispatch` รัน semantic-release เพื่อสร้างแท็กเวอร์ชันและ GitHub release จากนั้นสร้างอิมเมจ Docker หลายสถาปัตยกรรม (amd64 + arm64) แล้ว push ไปยัง Docker Hub (`snapotter/snapotter`) และ GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`)
- **deploy-docs.yml** สร้างไซต์เอกสารนี้และปรับใช้ไปยัง Cloudflare Pages เมื่อมีการ push ไปยัง `main`

หากต้องการสร้างรุ่น ให้ไปที่ **Actions > Release > Run workflow** ใน UI ของ GitHub หรือรัน:

```bash
gh workflow run release.yml
```

Semantic-release กำหนดเวอร์ชันจากประวัติคอมมิต แท็ก Docker `latest` ชี้ไปยังรุ่นล่าสุดเสมอ

## การวิเคราะห์ {#analytics}

SnapOtter มีการวิเคราะห์ผลิตภัณฑ์แบบไม่ระบุตัวตน (รูปแบบการใช้เครื่องมือ รายงานข้อผิดพลาด) เพื่อช่วยจับข้อบกพร่องและปรับปรุงฟีเจอร์ เปิดใช้เป็นค่าเริ่มต้น ไฟล์ ชื่อไฟล์ และข้อมูลส่วนบุคคลของคุณไม่เคยเป็นส่วนหนึ่งของข้อมูลนี้ SnapOtter ทำงานได้ตามปกติเมื่อปิดการวิเคราะห์

### การปิดการวิเคราะห์ {#disabling-analytics}

การเลือกปิดขณะรันทำได้ด้วยสวิตช์ของผู้ดูแลระบบเพียงคลิกเดียว เปิด Settings > System > Privacy แล้วปิด Anonymous Product Analytics การทำงานจะหยุดทันทีสำหรับทั้งอินสแตนซ์ โดยไม่ต้องสร้างใหม่

สำหรับอิมเมจที่ไม่มีทางส่งข้อมูลวิเคราะห์ได้เลย ให้ตั้งค่าปิดถาวรตอนสร้างโดยโคลนรีโพซิทอรีแล้วสร้างใหม่:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

หรือเพิ่ม build arg ลงใน `docker-compose.yml` ที่มีอยู่ของคุณ:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
