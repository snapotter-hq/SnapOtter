---
description: "ปรับใช้ SnapOtter สู่โปรดักชันด้วย Docker ความต้องการฮาร์ดแวร์ การตั้งค่า GPU และคอนฟิก reverse proxy สำหรับ Nginx, Traefik และ Cloudflare"
i18n_output_hash: d21da61a4516
i18n_source_hash: e0d8d5f6fc87
i18n_provenance: human
---

# Deployment {#deployment}

SnapOtter ปรับใช้เป็นสแตก Docker Compose แบบ 3 คอนเทนเนอร์: อิมเมจแอป SnapOtter, PostgreSQL 17 และ Redis 8 อิมเมจแอปรองรับ **linux/amd64** (พร้อม NVIDIA CUDA สำหรับการเร่งความเร็ว AI) และ **linux/arm64** (CPU) จึงทำงานได้แบบเนทีฟบนเซิร์ฟเวอร์ Intel/AMD, Mac ที่ใช้ Apple Silicon และอุปกรณ์ ARM อย่าง Raspberry Pi 4/5 ปัจจุบันยังไม่รองรับการเร่งความเร็วด้วย iGPU ของ Intel/AMD ผ่าน VA-API, Quick Sync หรือ OpenCL สำหรับการอนุมาน AI

ดู [Docker Image](./docker-tags) สำหรับการตั้งค่า GPU ตัวอย่าง Docker Compose และการปักหมุดเวอร์ชัน


<!-- korean-ocr-contract:start -->
::: info ความเข้ากันได้ของ OCR ภาษาเกาหลี
OCR แบบเร็วรองรับ `auto`, `en`, `de`, `es`, `fr`, `zh` และ `ja` แต่ไม่รองรับภาษาเกาหลี (`ko`) ภาษาเกาหลีต้องใช้แพ็ก OCR แบบแม่นยำและ `balanced` หรือ `best` แพ็กทำงานบนคอนเทนเนอร์ Linux amd64 และ arm64 อย่างเป็นทางการ รวมถึงโฮสต์ NVIDIA ซึ่ง OCR ยังคงทำงานบน CPU ระบบที่ไม่รองรับจะส่งคืนข้อผิดพลาดความเข้ากันได้อย่างชัดเจนและไม่ย้อนกลับไปใช้ `fast` โดยเงียบ ๆ ภาษาเกาหลีร่วมกับ `fast` หรือนามแฝงเดิม `tesseract` จะถูกปฏิเสธก่อนเข้าคิวด้วย `FEATURE_INCOMPATIBLE` และ `fast-korean-unsupported`
:::
<!-- korean-ocr-contract:end -->
## Quick Start (CPU) {#quick-start-cpu}

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=true         # Trust X-Forwarded-For headers (set false if not behind a proxy)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)
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
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
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

> **โดน Docker Hub จำกัดอัตราการดึงหรือเปล่า?** แทนที่ `snapotter/snapotter:latest` ด้วย `ghcr.io/snapotter-hq/snapotter:latest` เพื่อดึงจาก GitHub Container Registry แทน ทั้งสอง registry จะได้รับอิมเมจเดียวกันในทุกรีลีส

## Quick Start (NVIDIA CUDA) {#quick-start-nvidia-cuda}

สำหรับการเร่งความเร็ว NVIDIA CUDA บนเครื่องมือ AI ที่รองรับ (การลบพื้นหลัง การลดขนาด การปรับปรุงใบหน้า):

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
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

ตรวจสอบการตรวจพบ CUDA ในบันทึกล็อก:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Hardware Requirements {#hardware-requirements}

ตัวเลขเหล่านี้มาจากการทดสอบประสิทธิภาพบนระบบหลากหลาย ตั้งแต่เวิร์กสเตชัน amd64 รุ่นใหม่ที่มี NVIDIA RTX 4070 ไปจนถึง Raspberry Pi โดยรันแคตตาล็อกเครื่องมือทั้งชุดบนแต่ละเครื่อง และกวาดค่าขีดจำกัดทรัพยากรของ Docker เพื่อหาขีดต่ำสุดที่แท้จริง

### Quick Reference {#quick-reference}

| ระดับ | กรณีใช้งาน | CPU | RAM | GPU | พื้นที่เก็บข้อมูล |
|------|----------|-----|-----|-----|---------|
| ขั้นต่ำ | เครื่องมือรูปภาพ ไฟล์ และ PDF แบบเบา; ผู้ใช้คนเดียว; ชุดงานเล็ก | 2 คอร์ | 2 GB | ไม่มี | ~7 GB |
| แนะนำ | ครบทั้งห้าโมดัลลิตี รวมถึงวิดีโอ, PDF และ AI บน CPU; ชุดงาน; ผู้ใช้ไม่กี่คน | 4 คอร์ | 4 GB | ไม่มี | ~25 GB |
| เต็มรูปแบบ | ทุกอย่างแบบเร็ว รวมถึง GPU AI; ชุดงานขนาดใหญ่; ผู้ใช้จำนวนมาก | 6-8 คอร์ | 8 GB | NVIDIA VRAM 8 GB ขึ้นไป (12 GB จะสบายกว่า) | ~35 GB |

**สถาปัตยกรรม: 64 บิตเท่านั้น** (`linux/amd64` หรือ `linux/arm64`) SnapOtter ทำงานแบบเนทีฟบนเซิร์ฟเวอร์ Intel/AMD, Mac ที่ใช้ Apple Silicon และบอร์ด ARM แบบ 64 บิต รวมถึง **Raspberry Pi 4 และ 5** (4-8 GB) มัน **ไม่** ทำงานบน ARM แบบ 32 บิต (`armv7`/`armhf`) เพราะไม่มีการสร้างอิมเมจสำหรับสถาปัตยกรรมนั้น และไม่ทำงานบนบอร์ดระดับ 512 MB อย่าง Pi Zero ซึ่งอยู่ต่ำกว่าขีดต่ำสุดของหน่วยความจำ (ดูด้านล่าง)

### Minimum (เครื่องมือรูปภาพ ไฟล์ และ PDF แบบเบา; ไม่มี AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| ทรัพยากร | ความต้องการ |
|---|---|
| CPU | 2 คอร์ |
| RAM | 2 GB |
| ดิสก์ | ~5.5 GB (อิมเมจ) + วอลุ่มข้อมูล |
| GPU | ไม่จำเป็น |

เครื่องมือในแคตตาล็อกที่ไม่ใช่ AI ทั้ง 222 รายการ ได้แก่ รูปภาพ (ปรับขนาด, ครอป, แปลง, บีบอัด, ปรับแต่ง, ลายน้ำ), วิดีโอ (ตัด, ปิดเสียง, remux), เสียง (แปลง, นอร์มัลไลซ์, ตัด), PDF (รวม, แยก, บีบอัด, หมุน, ป้องกัน), การแปลงไฟล์ และพรีเซ็ตการแปลงเฉพาะทาง ล้วนทำงานได้บนฮาร์ดแวร์ธรรมดา การดำเนินการส่วนใหญ่เสร็จภายในเวลาต่ำกว่าหนึ่งวินาทีมากแม้กับไฟล์ขนาดใหญ่: รูปภาพขนาด 2.7 MB ปรับขนาดในเวลา ~0.05 วินาที และเข้ารหัสใหม่เป็น WebP ใน ~2 วินาที

ขีดต่ำสุดของหน่วยความจำเป็นเรื่องจริง จากการกวาดค่าขีดจำกัดทรัพยากรของ Docker: **512 MB ไม่สามารถเริ่มสแตกได้** (แม้แต่การปรับขนาดรูปภาพไฟล์เดียวก็ถูกฆ่า), **1 GB** จัดการการดำเนินการไฟล์เดียวได้ แต่ชุดงานหลายไฟล์จะหน่วยความจำหมด และ **2 GB / 2 คอร์** คือคอนฟิกที่เล็กที่สุดซึ่งจัดการชุดงานได้อย่างสบาย

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**ข้อยกเว้นเดียวที่กิน CPU หนักคือการเข้ารหัสวิดีโอใหม่** การดำเนินการแบบ stream-copy (ตัด, ปิดเสียง, remux คอนเทนเนอร์) เกิดขึ้นทันที แต่การทรานส์โค้ดไปยัง codec อื่นถูกจำกัดด้วย CPU คลิป 1080p ยาว 45 วินาทีที่เข้ารหัสใหม่เป็น VP9 (WebM) ใช้เวลาราว **~40 วินาที** บน CPU รุ่นใหม่ที่เร็ว, ~45 วินาทีบน Apple Silicon, ~80 วินาทีบน mobile 4 คอร์รุ่นเก่า และ **~130 วินาที** บนเซิร์ฟเวอร์ 4 คอร์รุ่นเก่า หากงานของคุณเน้นวิดีโอ ให้เน้นจำนวนคอร์ CPU และความเร็วสัญญาณนาฬิกา หรือเพิ่มขีดจำกัด `cpus:` ของคอนเทนเนอร์ โดยค่าเริ่มต้น compose ที่ให้มาจำกัดแอปไว้ที่ 4 คอร์ (8 คอร์บน compose ของ GPU)

### Recommended (เครื่องมือ AI บน CPU) {#recommended-ai-tools-on-cpu}

| ทรัพยากร | ความต้องการ |
|---|---|
| CPU | 4 คอร์ |
| RAM | 4 GB |
| Disk | 3 GB (รูปภาพ) + ประมาณ 20 GB (แพ็ก AI เสริมทั้งหมด) + พื้นที่ทำงาน |
| GPU | ไม่จำเป็น (สำรองด้วย CPU) |

**การติดตั้งและใช้งานชุด AI ที่ใหญ่ขึ้นคือสิ่งที่ผลักดันคำแนะนำไปที่ RAM ขนาด 4 GB** เมื่อไม่มีชุดเสริมติดตั้ง แอปจะมีพื้นที่ว่างประมาณ 360 MB เครื่องมือ Python รุ่นเก่าใช้ sidecar ร่วมกัน ในขณะที่ OCR ที่แม่นยำใช้ dispatcher ที่มีอายุการใช้งานยาวนานโดยเฉพาะซึ่งปักหมุดไว้กับรุ่นที่ไม่เปลี่ยนรูปแบบที่ใช้งานอยู่ ก่อนการเปิดใช้งาน ตัวติดตั้งจะรัน smoke test บนตัวเลือก จากนั้นจะสลับไปที่ dispatcher ใหม่แบบอะตอมมิก และระบาย dispatcher ก่อนหน้าก่อน garbage collection อาร์ติแฟกต์ OCR ที่แม่นยำอย่างเป็นทางการทุกรายการจะต้องผ่าน release suite ที่แย่ที่สุดภายใน 4 GiB cgroup ในขณะที่คำแนะนำโฮสต์ 4 GB จะเหลือพื้นที่ว่างสำหรับแอปพลิเคชัน Node.js, Postgres, Redis, คิว และงานที่เกิดขึ้นพร้อมกัน

เครื่องมือ AI ส่วนใหญ่ใช้งานได้ดีบน CPU; มีบางตัวที่ต้องการ GPU จริงๆ วัดผลบน CPU 4 คอร์รุ่นใหม่:

| เครื่องมือ AI | เวลาบน CPU | ใช้งานบน CPU ได้ไหม? |
|---|---|---|
| การตรวจจับใบหน้า (เบลอใบหน้า, ครอปอัจฉริยะ, ตาแดง), การลบสัญญาณรบกวน | ต่ำกว่า 1 วินาที | ได้ |
| OCR, การถอดเสียง, คำบรรยาย | 1-3 วินาที | ได้ |
| ลงสี, ปรับปรุงใบหน้า | ~10 วินาที | ได้ |
| การลบ / แทนที่ / เบลอพื้นหลัง | ~29 วินาที | ได้ (ต้องรอ) |
| การขยายภาพ AI (RealESRGAN) | ~33 วินาทีสำหรับภาพเล็ก; หลายนาทีสำหรับภาพใหญ่ | ก้ำกึ่ง แนะนำให้ใช้ GPU อย่างยิ่ง |
| การฟื้นฟูภาพถ่าย (ไปป์ไลน์เต็มรูปแบบ) | หลายนาที | ไม่ได้ ต้องการ GPU หรือ CPU หลายคอร์ที่เร็ว |

SnapOtter จงใจไม่อบการดาวน์โหลดโมเดลเหล่านี้ลงในอิมเมจ Docker บันเดิล AI จะถูกดึงเมื่อผู้ดูแลระบบเปิดใช้เครื่องมือที่เกี่ยวข้องเท่านั้น เก็บไว้ในวอลุ่มถาวร `/data/ai` และแชร์ร่วมกันโดยทุกเครื่องมือที่พึ่งพาชุดโมเดลเดียวกัน วิธีนี้ทำให้อิมเมจคอนเทนเนอร์สุดท้ายมีขนาดเล็ก ในขณะที่ยังปล่อยให้การติดตั้ง AI เต็มรูปแบบไปถึงตัวเลขพื้นที่เก็บข้อมูลที่ใหญ่ขึ้นด้านล่าง

บางเครื่องมือพึ่งพาบันเดิลที่แชร์กันมากกว่าหนึ่งชุด ตัวอย่างเช่น Passport Photo ต้องการทั้ง `background-removal` และ `face-detection`; หากติดตั้ง `background-removal` ไว้แล้ว การเปิดใช้ Passport Photo จะดาวน์โหลดเฉพาะบันเดิล `face-detection` ที่ขาดไปเท่านั้น การนำกลับมาใช้ซ้ำแบบเดียวกันนี้ใช้กับเครื่องมือ AI ทั้งหมด

การประมาณการพื้นที่จัดเก็บแพ็ค AI เพิ่มเติม:

| บันเดิล | ขนาดดิสก์ |
|---|---|
| การลบพื้นหลัง | 4-5 GB |
| การขยายภาพ + ปรับปรุงใบหน้า + ลบสัญญาณรบกวน | 5-6 GB |
| การตรวจจับใบหน้า | 200-300 MB |
| ลบวัตถุ + ลงสี | 1-2 GB |
| OCR ที่แม่นยำ (`balanced`/`best`) | ~208-234 ดาวน์โหลด MiB / ~409-488 ติดตั้ง MiB แล้ว |
| การฟื้นฟูภาพถ่าย | 4-5 GB |
| การถอดเสียง | ~600เมกะไบต์ |
| **ทุกชุด** | **ติดตั้งแล้ว ~20 GB** |

Fast OCR ถูกสร้างไว้ในอิมเมจผ่าน Tesseract เพิ่มประมาณ 25 MiB และไม่ต้องใช้แพ็กเสริม OCR หรือข้อกำหนดหน่วยความจำ GiB 4 ตัว แพ็กที่ถูกต้องมีอยู่ในคอนเทนเนอร์ Linux amd64 และ arm64 อย่างเป็นทางการ และเรียกใช้ ONNX Runtime บน CPU โฮสต์ NVIDIA ใช้รันไทม์ CPU OCR เดียวกัน ดังนั้น OCR จึงไม่ขึ้นอยู่กับเวอร์ชัน CUDA หรือสถาปัตยกรรม GPU รันไทม์ที่ถูกต้องต้องใช้หน่วยความจำที่มีประสิทธิภาพอย่างน้อย 4 GiB: ขีดจำกัดคอนเทนเนอร์ cgroup ที่กำหนดค่าไว้ ไม่เช่นนั้นหน่วยความจำโฮสต์ SnapOtter ปฏิเสธระบบที่ต่ำกว่าซึ่งลงนามความเข้ากันได้ขั้นต่ำก่อนที่จะดาวน์โหลดแพ็ก การติดตั้งแพ็กที่แม่นยำยังถูกปฏิเสธในไฟล์เก็บถาวร bare-metal/ที่สร้างไว้ล่วงหน้าซึ่งไม่สามารถรับประกัน libc และ Python ABI ได้

รีพลิกาที่ใช้ `DATA_DIR` ร่วมกันต้องใช้สถาปัตยกรรม CPU เดียวกัน โดยตรึงการปรับใช้แบบหลายรีพลิกาไว้กับโหนดที่เข้ากันได้ด้วย node affinity รีพลิกา amd64/arm64 แบบผสมต้องใช้โวลุ่มข้อมูลแยกกันและการปรับใช้ SnapOtter ที่เป็นอิสระต่อกัน

รันไทม์ที่แม่นยำจะคงรุ่นที่ใช้งานอยู่หนึ่งรุ่นและล้างแคชการดาวน์โหลดหลังจากเปิดใช้งาน สำหรับรีลีสนี้ การติดตั้งครั้งแรกต้องใช้ประมาณ 620-720 MiB ชั่วคราวสำหรับไฟล์เก็บถาวรและการจัดเตรียม และการอัปเกรดอาจถึงจุดสูงสุดเกือบ 1.2 GiB ในขณะที่รุ่นเก่ายังคงใช้งานอยู่ โปรแกรมติดตั้งจะคำนวณข้อกำหนดที่แน่นอนจากดัชนีที่ลงนามและรุ่นปัจจุบันก่อนที่จะดาวน์โหลดหรือแยกข้อมูล และจะล้มเหลวก่อนหากปริมาณข้อมูลน้อยเกินไป

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Full (เครื่องมือ AI บน NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| ทรัพยากร | ความต้องการ |
|---|---|
| CPU | 6-8 คอร์ (การเตรียมวิดีโอ + การทำงานพร้อมกันรันบน CPU แม้จะใช้ GPU AI) |
| RAM | 8 GB |
| GPU | NVIDIA ที่มี VRAM 8 GB ขึ้นไป (แนะนำ 12 GB) |
| ดิสก์ | ~35 GB รวม |

GPU ของ NVIDIA (CUDA) เร่งความเร็วโมเดล AI ที่หนักได้อย่างมาก วัดผลบน RTX 4070 เทียบกับ CPU รุ่นใหม่:

| เครื่องมือ AI | ความเร็วที่เพิ่มขึ้นด้วย GPU | หมายเหตุ |
|---|---|---|
| การขยายภาพ AI (RealESRGAN 2×) | **~47×** | ชัยชนะที่ใหญ่ที่สุด ต่ำกว่าหนึ่งวินาที เทียบกับ ~33 วินาที (หลายนาทีสำหรับภาพใหญ่) |
| การปรับปรุงใบหน้า (CodeFormer) | **~12×** | ~0.9 วินาที เทียบกับ ~11 วินาที |
| การถอดเสียง (Whisper) | ~4.5× | |
| การลบ / แทนที่ / เบลอพื้นหลัง | ~4× | ~7 วินาทีบน GPU เทียบกับ ~29 วินาทีบน CPU |
| ลงสี | ~1.8× | |
| OCR, การตรวจจับใบหน้า, ตาแดง, การลบสัญญาณรบกวน | ~1× | เร็วอยู่แล้วบน CPU GPU ไม่ช่วย |
| การฟื้นฟูภาพถ่าย | ไม่มี | ถูกจำกัดด้วย CPU แม้บน GPU (ใช้ GPU 0%); CPU ที่เร็วสำคัญกว่า GPU ในกรณีนี้ |

เครื่องมือที่คุ้มค่ากับ GPU คือ **การขยายภาพ, การปรับปรุงใบหน้า, การถอดเสียง และการลบพื้นหลัง** การตรวจจับใบหน้า, OCR และตาแดงถูกจำกัดด้วย CPU และเร็วอยู่แล้ว ดังนั้น GPU จึงไม่เพิ่มอะไร

การใช้ VRAM สูงสุดพุ่งถึง 7.5 GB ระหว่างการขยายภาพพร้อมการปรับปรุงใบหน้า GPU ของ NVIDIA ขนาด 6 GB ใช้ได้กับเครื่องมือ AI ส่วนใหญ่ทีละตัว แต่จะล้มเหลวกับการขยายภาพ VRAM 8-12 GB จัดการได้ทุกอย่าง

ปัจจุบันยังไม่รองรับการเร่งความเร็วด้วย iGPU ของ Intel/AMD ผ่าน VA-API, Quick Sync หรือ OpenCL สำหรับการอนุมาน AI การแมป `/dev/dri` เข้าไปในคอนเทนเนอร์ไม่ได้เปิดใช้การเร่งความเร็ว AI ด้วย GPU; SnapOtter จะรันเครื่องมือ AI บน CPU เว้นแต่จะมี NVIDIA CUDA

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

### Concurrent Users {#concurrent-users}

คำขอปรับขนาดรูปภาพแบบขนานที่ยิงไปยังคอนเทนเนอร์แอปซึ่งจำกัดไว้ที่ 4 คอร์โดยค่าเริ่มต้น:

| คำขอพร้อมกัน | เวลาตอบสนองเฉลี่ย | ข้อผิดพลาด |
|---|---|---|
| 1 | 0.4 วินาที | 0 |
| 5 | 1.2 วินาที | 0 |
| 10 | 2.1 วินาที | 0 |

เวลาตอบสนองลดลงแบบต่ำกว่าเชิงเส้นโดยไม่มีข้อผิดพลาดเมื่อ worker pool เต็ม การเพิ่มขีดจำกัด `cpus:` ของคอนเทนเนอร์แอป (หรือใช้โฮสต์ที่มีคอร์มากกว่า) จะยกเพดานขึ้น โปรดทราบว่างานหนัก (การทรานส์โค้ดวิดีโอ, CPU AI) จะยึด worker ไว้ตลอดระยะเวลาทั้งหมด ดังนั้นให้กำหนดขนาด CPU ตามจำนวนงานหนักที่คาดว่าจะทำพร้อมกัน ไม่ใช่แค่จำนวนคำขอ

### Supported Image Formats {#supported-image-formats}

SnapOtter รองรับ **รูปแบบอินพุต 55+ รูปแบบ** และ **รูปแบบเอาต์พุต 14 รูปแบบ** รวมถึงไฟล์ RAW จากกล้อง 20+ แบรนด์ รูปแบบระดับมืออาชีพ (PSD, EPS, OpenEXR, HDR), codec สมัยใหม่ (JPEG XL, AVIF, HEIC, QOI) และรูปแบบทางวิทยาศาสตร์/เกม (FITS, DDS)

ดู [รายการรูปแบบทั้งหมด](/th/guide/supported-formats) สำหรับรายละเอียดของทุกรูปแบบที่รองรับ ตัวถอดรหัสที่ใช้ และตัวควบคุมคุณภาพที่มีให้

### Known Limitations {#known-limitations}

- **Content-aware resize** ล้มเหลวกับภาพขนาดใหญ่ (>5 MP) เนื่องจากข้อจำกัดในไบนารี caire ทำงานได้ดีกับภาพขนาดเล็กกว่า
- **การถอดรหัส HEIF** ใช้เวลา 13-23 วินาที HEIC (รุ่นของ Apple) เร็วกว่ามากที่ 0.3-0.9 วินาที
- **การขยายภาพ** หมดเวลาบน CPU สำหรับทุกอย่างที่เกินภาพขนาดเล็ก ต้องใช้ GPU สำหรับการใช้งานจริง
- **CodeFormer** ปรับปรุงใบหน้าช้ากว่า GFPGAN อย่างมีนัยสำคัญ (53 วินาที เทียบกับ 2 วินาทีบน GPU) แนะนำ GFPGAN สำหรับกรณีใช้งานส่วนใหญ่

## Volumes {#volumes}

| เมานต์ / วอลุ่ม | วัตถุประสงค์ | จำเป็นไหม? |
|---|---|---|
| `/data` (แอป) | โมเดล AI, Python venv, ไฟล์ผู้ใช้ | **ใช่** ไฟล์จะสูญหายหากไม่มี |
| `/tmp/workspace` (แอป) | ไฟล์ประมวลผลชั่วคราว (ทำความสะอาดอัตโนมัติ) | แนะนำ |
| `SnapOtter-pgdata` (postgres) | ไดเรกทอรีข้อมูล PostgreSQL (ผู้ใช้, การตั้งค่า, ไปป์ไลน์, งาน) | **ใช่** ข้อมูลจะสูญหายหากไม่มี |
| `SnapOtter-redisdata` (redis) | ไฟล์ append-only ของ Redis สำหรับคิวงานแบบทนทาน | แนะนำ |

### Bind mounts vs. named volumes {#bind-mounts-vs-named-volumes}

**Named volumes** (แนะนำ) Docker จัดการสิทธิ์ให้โดยอัตโนมัติ:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounts** คุณจัดการสิทธิ์เอง ตั้งค่า `PUID`/`PGID` ให้ตรงกับผู้ใช้บนโฮสต์ของคุณ:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Storage permissions {#storage-permissions}

SnapOtter เขียนลงสองตำแหน่งขณะรันไทม์: `/data` (ไฟล์ผู้ใช้, ล็อก, โมเดล AI และ Python venv) และ `/tmp/workspace` (พื้นที่ประมวลผลชั่วคราว) ทั้งสองตำแหน่งต้องเขียนได้โดยผู้ใช้ที่คอนเทนเนอร์รันอยู่ หากตำแหน่งใดเขียนไม่ได้ คอนเทนเนอร์จะ **ล้มเหลวทันทีตอนเริ่มทำงาน** พร้อมข้อความที่ระบุชื่อไดเรกทอรี, UID/GID ที่กำลังรัน และวิธีแก้ไข แทนที่จะบูตแบบ \"สุขภาพดี\" แล้วล้มเหลวตอนอัปโหลดครั้งแรกด้วยข้อผิดพลาดที่เข้าใจยาก

วิธีจัดการสิทธิ์ขึ้นอยู่กับวิธีที่คอนเทนเนอร์ถูกเปิดใช้:

**ค่าเริ่มต้น (เริ่มเป็น root แล้วลดสิทธิ์เป็น `snapotter`)** entrypoint เริ่มเป็น root แก้ไขความเป็นเจ้าของของวอลุ่มที่เมานต์ไว้ จากนั้นลดสิทธิ์เป็นผู้ใช้ `snapotter` ที่ไม่มีสิทธิ์พิเศษผ่าน `gosu` Named volumes ทำงานได้โดยไม่ต้องตั้งค่าใด สำหรับ bind mounts ให้ตั้งค่า `PUID`/`PGID` เป็นผู้ใช้บนโฮสต์ของคุณ (ด้านบน) เพื่อให้ไฟล์ที่มันเขียนเป็นของคุณ

**Kubernetes / OpenShift (non-root ผ่าน `runAsUser`)** เมื่อเปิดใช้เป็นผู้ใช้ที่ไม่ใช่ root โดยตรง คอนเทนเนอร์ไม่สามารถ chown วอลุ่มได้เอง ดังนั้น orchestrator ต้องทำให้มันเขียนได้ ตั้งค่า `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

ไดเรกทอรีที่เขียนได้ของอิมเมจเป็นของกลุ่ม GID 0 และกลุ่มสามารถเขียนได้ ดังนั้น pod ที่รันด้วย **UID ใดก็ได้** พร้อมกลุ่มเสริม root (ค่าเริ่มต้นของ OpenShift) สามารถเขียนได้โดยไม่ต้อง `chown`

**TrueNAS Scale (และการตั้งค่า \"UID ต่างถิ่น\" อื่นๆ)** TrueNAS รันแอปเป็นผู้ใช้ที่ไม่ใช่ root (มักเป็น `568:568`) และเมานต์ dataset ของโฮสต์ที่เป็นของผู้ใช้อื่น ดังนั้นทั้ง entrypoint และ `fsGroup` ต่างก็ไม่ทำให้มันเขียนได้ด้วยตัวเอง เลือกอย่างใดอย่างหนึ่ง:

- **รันแอปเป็น root** (แนะนำ) ปล่อยให้ผู้ใช้ของแอปไม่ได้ตั้งค่า หรือตั้งเป็น `0` แล้วให้ entrypoint ค่าเริ่มต้นแก้ไขสิทธิ์และลดสิทธิ์เป็น `snapotter`
- **รันเป็น UID `999`** ตั้งค่าผู้ใช้/กลุ่มของแอปเป็น `999:999` (ผู้ใช้ `snapotter` ในตัวของ SnapOtter) เพื่อให้ตรงกับความเป็นเจ้าของของอิมเมจ
- **`chown` dataset ของโฮสต์** เป็น UID ที่คอนเทนเนอร์รันอยู่ จากเชลล์ของ TrueNAS:

  ```bash
  # ใช้ UID จากข้อผิดพลาดตอนเริ่มทำงาน (หรือรัน `id` ในคอนเทนเนอร์)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

ข้อผิดพลาดตอนเริ่มทำงานจะระบุ UID ที่แน่นอนให้ใช้ ดังนั้นเส้นทางที่เร็วที่สุดคือเริ่มแอปหนึ่งครั้ง อ่านข้อความ แล้ว `chown` (หรือปรับผู้ใช้) ตามนั้น

## Environment Variables {#environment-variables}

| ตัวแปร | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|
| `AUTH_ENABLED` | `true` | เปิด/ปิดข้อกำหนดการล็อกอิน |
| `DEFAULT_USERNAME` | `admin` | ชื่อผู้ใช้แอดมินเริ่มต้น |
| `DEFAULT_PASSWORD` | `admin` | รหัสผ่านแอดมินเริ่มต้น (บังคับเปลี่ยนตอนล็อกอินครั้งแรก) |
| `MAX_UPLOAD_SIZE_MB` | `100` | ขีดจำกัดการอัปโหลดต่อไฟล์ |
| `MAX_BATCH_SIZE` | `100` | จำนวนไฟล์สูงสุดต่อคำขอชุด |
| `RATE_LIMIT_PER_MIN` | `1000` | คำขอ API ต่อนาทีต่อ IP (ตั้ง 0 เพื่อปิด) |
| `MAX_USERS` | `0` (ไม่จำกัด) | จำนวนบัญชีผู้ใช้สูงสุด |
| `TRUST_PROXY` | `true` | เชื่อถือส่วนหัว X-Forwarded-For จาก reverse proxy |
| `PUID` | `999` | รันเป็น UID นี้ (สำหรับสิทธิ์ bind mount) |
| `PGID` | `999` | รันเป็น GID นี้ (สำหรับสิทธิ์ bind mount) |
| `LOG_LEVEL` | `info` | ระดับความละเอียดของล็อก: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (อัตโนมัติ) | จำนวนงานประมวลผล AI แบบขนานสูงสุด |
| `SESSION_DURATION_HOURS` | `168` | อายุของเซสชันการล็อกอิน (7 วัน) |
| `CORS_ORIGIN` | (ว่าง) | origin ที่อนุญาตคั่นด้วยคอมมา หรือปล่อยว่างสำหรับ same-origin |

### พร็อกซีขาออกและ CA ส่วนตัว {#outbound-proxy-and-private-ca}

คอนเทนเนอร์อย่างเป็นทางการเปิดใช้งานการสนับสนุนพร็อกซีสภาพแวดล้อมของโหนด หาก SnapOtter ต้องเข้าถึงพื้นที่เก็บข้อมูลรันไทม์ OCR หรือบริการ HTTPS อื่นๆ ผ่านพร็อกซีองค์กร ให้ตั้งค่า `HTTPS_PROXY` (และ `HTTP_PROXY` เมื่อจำเป็น) ตั้งค่า `NO_PROXY` เป็นรายการโฮสต์ที่คั่นด้วยเครื่องหมายจุลภาคที่ต้องเข้าถึงโดยตรง เช่น Postgres, Redis และที่เก็บข้อมูลอ็อบเจ็กต์ภายใน

หากพร็อกซีหรือบริการภายในลงนามโดยผู้ออกใบรับรองส่วนตัว ให้ต่อเชื่อมใบรับรอง CA แบบอ่านอย่างเดียวแล้วชี้ `NODE_EXTRA_CA_CERTS` ไปที่ใบรับรองนั้น ไฟล์จะต้องมีอยู่เมื่อกระบวนการโหนดเริ่มต้น:

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

เก็บข้อมูลรับรองพร็อกซีไว้นอกไฟล์ Compose (เช่น ในไฟล์ `.env` ที่ได้รับการป้องกันหรือเป็นความลับ) อย่าปิดใช้งานการตรวจสอบ TLS: ดัชนี OCR ที่ลงชื่อจะตรวจสอบความถูกต้องของข้อมูลเมตาที่เผยแพร่ ในขณะที่การตรวจสอบ TLS ปกติยังคงปกป้องการขนส่งและคำขอขาออกอื่นๆ ทั้งหมด

## Health Check {#health-check}

คอนเทนเนอร์มี health check ในตัว:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse Proxy {#reverse-proxy}

SnapOtter ตั้งค่า `TRUST_PROXY=true` โดยค่าเริ่มต้น เพื่อให้การจำกัดอัตราและการบันทึกล็อกใช้ IP จริงของไคลเอนต์จากส่วนหัว `X-Forwarded-For`

### Nginx {#nginx}

```nginx
server {
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

        # SSE support (batch progress, feature install progress)
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Nginx Proxy Manager {#nginx-proxy-manager}

1. เพิ่ม Proxy Host ใหม่
2. ตั้ง Domain Name เป็นโดเมนของคุณ
3. ตั้ง Scheme เป็น `http`, Forward Hostname เป็น `SnapOtter` (หรือ IP ของคอนเทนเนอร์), Forward Port เป็น `1349`
4. เปิดใช้การรองรับ WebSocket
5. ในส่วน Advanced ให้เพิ่ม: `client_max_body_size 500M;` และ `proxy_buffering off;`

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

`flush_interval -1` ปิดการบัฟเฟอร์การตอบสนอง ซึ่งจำเป็นสำหรับเหตุการณ์ความคืบหน้า SSE (การประมวลผลชุด, เครื่องมือ AI, การติดตั้งฟีเจอร์) การหมดเวลาที่ยืดออกช่วยให้การอัปโหลดไฟล์ขนาดใหญ่เสร็จสมบูรณ์โดยที่ Caddy ไม่ปิดการเชื่อมต่อก่อนกำหนด

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

หมายเหตุ: Cloudflare มีขีดจำกัดการอัปโหลด 100 MB บนแผนฟรี ตั้งค่า `MAX_UPLOAD_SIZE_MB=100` ให้ตรงกัน

## CI/CD {#ci-cd}

ที่เก็บ GitHub มีเวิร์กโฟลว์สามชุด:

- **ci.yml** รันอัตโนมัติในทุก push และ PR ทำ lint, typecheck, ทดสอบ, build และตรวจสอบอิมเมจ Docker (โดยไม่ push)
- **release.yml** ทริกเกอร์ด้วยตนเองผ่าน `workflow_dispatch` รัน semantic-release เพื่อสร้าง version tag และ GitHub release จากนั้นสร้างอิมเมจ Docker แบบหลายสถาปัตยกรรม (amd64 + arm64) และ push ไปยัง Docker Hub (`snapotter/snapotter`) และ GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`)
- **deploy-docs.yml** สร้างไซต์เอกสารนี้และปรับใช้ไปยัง Cloudflare Pages เมื่อ push ไปยัง `main`

หากต้องการสร้างรีลีส ให้ไปที่ **Actions > Release > Run workflow** ใน GitHub UI หรือรัน:

```bash
gh workflow run release.yml
```

Semantic-release กำหนดเวอร์ชันจากประวัติคอมมิต แท็ก Docker `latest` ชี้ไปยังรีลีสล่าสุดเสมอ

## Analytics {#analytics}

SnapOtter มีการวิเคราะห์ผลิตภัณฑ์แบบไม่ระบุตัวตน (รูปแบบการใช้เครื่องมือ, รายงานข้อผิดพลาด) เพื่อช่วยจับบั๊กและปรับปรุงฟีเจอร์ โดยเปิดใช้เป็นค่าเริ่มต้น ไฟล์ ชื่อไฟล์ และข้อมูลส่วนบุคคลของคุณไม่เคยเป็นส่วนหนึ่งของสิ่งนี้ SnapOtter ทำงานได้ตามปกติเมื่อปิดการวิเคราะห์

### Disabling analytics {#disabling-analytics}

การเลือกไม่เข้าร่วมขณะรันไทม์เป็นสวิตช์แอดมินแบบคลิกเดียว เปิด Settings > System > Privacy แล้วปิด Anonymous Product Analytics มันจะหยุดทันทีสำหรับทั้งอินสแตนซ์ โดยไม่ต้อง build ใหม่

สำหรับอิมเมจที่ไม่มีทางส่งการวิเคราะห์ได้เลย ให้ตั้งค่าการปิดแบบถาวรตอน build โดยโคลนที่เก็บและ build ใหม่:

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
