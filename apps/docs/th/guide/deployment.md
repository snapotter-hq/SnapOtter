---
description: "ปรับใช้ SnapOtter สู่โปรดักชันด้วย Docker ข้อกำหนดฮาร์ดแวร์ การตั้งค่า GPU และการกำหนดค่า reverse proxy สำหรับ Nginx, Traefik และ Cloudflare"
i18n_source_hash: ecc1b528bc4b
i18n_provenance: human
i18n_output_hash: 2ee135af16da
---

# การปรับใช้ (Deployment) {#deployment}

SnapOtter ปรับใช้เป็นสแตก Docker Compose แบบ 3 คอนเทนเนอร์: อิมเมจแอป SnapOtter, PostgreSQL 17 และ Redis 8 อิมเมจแอปรองรับ **linux/amd64** (พร้อม NVIDIA CUDA สำหรับการเร่งความเร็ว AI) และ **linux/arm64** (CPU) จึงรันได้แบบเนทีฟบนเซิร์ฟเวอร์ Intel/AMD, Mac ที่ใช้ Apple Silicon และอุปกรณ์ ARM อย่าง Raspberry Pi 4/5 ปัจจุบันยังไม่รองรับการเร่งความเร็ว iGPU ของ Intel/AMD ผ่าน VA-API, Quick Sync หรือ OpenCL สำหรับการอนุมานผล AI

ดู [Docker Image](./docker-tags) สำหรับการตั้งค่า GPU ตัวอย่าง Docker Compose และการปักหมุดเวอร์ชัน

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

> **โดนจำกัดอัตราของ Docker Hub?** แทนที่ `snapotter/snapotter:latest` ด้วย `ghcr.io/snapotter-hq/snapotter:latest` เพื่อดึงจาก GitHub Container Registry แทน รีจิสตรีทั้งสองได้รับอิมเมจเดียวกันในทุกการรีลีส

## เริ่มต้นอย่างรวดเร็ว (NVIDIA CUDA) {#quick-start-nvidia-cuda}

สำหรับการเร่งความเร็ว NVIDIA CUDA บนเครื่องมือ AI (การลบพื้นหลัง, การขยายภาพ, การเพิ่มคุณภาพใบหน้า, OCR):

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

ตรวจสอบการตรวจจับ CUDA ใน log:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## ข้อกำหนดฮาร์ดแวร์ {#hardware-requirements}

ตัวเลขเหล่านี้มาจากการทดสอบเบนช์มาร์กในระบบหลากหลาย ตั้งแต่เวิร์กสเตชัน amd64 สมัยใหม่ที่มี NVIDIA RTX 4070 ไปจนถึง Raspberry Pi โดยรันแคตตาล็อกเครื่องมือทั้งหมดบนแต่ละเครื่องและกวาดขีดจำกัดทรัพยากรของ Docker เพื่อหาขีดต่ำสุดที่แท้จริง

### อ้างอิงอย่างรวดเร็ว {#quick-reference}

| ระดับ | กรณีการใช้งาน | CPU | RAM | GPU | พื้นที่จัดเก็บ |
|------|----------|-----|-----|-----|---------|
| ขั้นต่ำ | เครื่องมือภาพ, ไฟล์ และ PDF แบบเบา; ผู้ใช้คนเดียว; แบตช์ขนาดเล็ก | 2 คอร์ | 2 GB | ไม่มี | ~7 GB |
| แนะนำ | ทั้งห้าโมดัลลิตี รวมถึงวิดีโอ, PDF และ AI บน CPU; แบตช์; ผู้ใช้ไม่กี่คน | 4 คอร์ | 4 GB | ไม่มี | ~25 GB |
| เต็มรูปแบบ | ทุกอย่างด้วยความเร็ว รวมถึง GPU AI; แบตช์ขนาดใหญ่; ผู้ใช้จำนวนมาก | 6-8 คอร์ | 8 GB | NVIDIA 8 GB+ VRAM (12 GB สบายๆ) | ~35 GB |

**สถาปัตยกรรม: 64-bit เท่านั้น** (`linux/amd64` หรือ `linux/arm64`) SnapOtter รันได้แบบเนทีฟบนเซิร์ฟเวอร์ Intel/AMD, Mac ที่ใช้ Apple Silicon และบอร์ด ARM 64-bit รวมถึง **Raspberry Pi 4 และ 5** (4-8 GB) แต่ **ไม่** รันบน ARM 32-bit (`armv7`/`armhf`) เพราะไม่มีการสร้างอิมเมจสำหรับมัน และไม่รันบนบอร์ดระดับ 512 MB เช่น Pi Zero ซึ่งต่ำกว่าขีดต่ำสุดของหน่วยความจำ (ดูด้านล่าง)

### ขั้นต่ำ (เครื่องมือภาพ, ไฟล์ และ PDF แบบเบา; ไม่มี AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| ทรัพยากร | ข้อกำหนด |
|---|---|
| CPU | 2 คอร์ |
| RAM | 2 GB |
| ดิสก์ | ~5.5 GB (อิมเมจ) + data volume |
| GPU | ไม่จำเป็น |

เครื่องมือในแคตตาล็อกที่ไม่ใช่ AI ทั้ง 222 ตัว - ภาพ (ปรับขนาด, ครอป, แปลง, บีบอัด, ปรับแต่ง, ลายน้ำ), วิดีโอ (ตัด, ปิดเสียง, remux), เสียง (แปลง, normalize, ตัด), PDF (รวม, แยก, บีบอัด, หมุน, ป้องกัน), การแปลงไฟล์ และ conversion preset เฉพาะทาง - รันได้บนฮาร์ดแวร์ระดับพอประมาณ การดำเนินการส่วนใหญ่เสร็จภายในเวลาน้อยกว่าหนึ่งวินาทีมากแม้กับไฟล์ขนาดใหญ่: ภาพ 2.7 MB ปรับขนาดภายใน ~0.05 วินาที และ re-encode เป็น WebP ภายใน ~2 วินาที

ขีดต่ำสุดของหน่วยความจำเป็นเรื่องจริง จากการกวาดขีดจำกัดทรัพยากรของ Docker: **512 MB ไม่สามารถเริ่มสแตกได้** (แม้แค่การปรับขนาดภาพเดียวก็ถูก kill), **1 GB** จัดการการดำเนินการไฟล์เดียวได้แต่แบตช์หลายไฟล์จะหน่วยความจำหมด และ **2 GB / 2 คอร์** เป็นการกำหนดค่าที่เล็กที่สุดที่จัดการแบตช์ได้อย่างสบาย

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**ข้อยกเว้นเดียวที่ใช้ CPU หนักคือการ re-encode วิดีโอ** การดำเนินการแบบ stream-copy (ตัด, ปิดเสียง, remux คอนเทนเนอร์) เกิดขึ้นทันที แต่การ transcode ไปยัง codec อื่นใช้ CPU เป็นหลัก คลิป 1080p / 45 วินาที ที่ re-encode เป็น VP9 (WebM) ใช้เวลาราว **~40 วินาที** บน CPU สมัยใหม่ที่เร็ว, ~45 วินาทีบน Apple Silicon, ~80 วินาทีบน mobile 4-core รุ่นเก่า และ **~130 วินาที** บนเซิร์ฟเวอร์ 4-core รุ่นเก่า หากงานของคุณเน้นวิดีโอ ให้ให้ความสำคัญกับจำนวนคอร์และความเร็วสัญญาณนาฬิกาของ CPU หรือเพิ่มขีดจำกัด `cpus:` ของคอนเทนเนอร์ - compose ที่ให้มาจำกัดแอปไว้ที่ 4 คอร์ตามค่าเริ่มต้น (8 บน compose ของ GPU)

### แนะนำ (เครื่องมือ AI บน CPU) {#recommended-ai-tools-on-cpu}

| ทรัพยากร | ข้อกำหนด |
|---|---|
| CPU | 4 คอร์ |
| RAM | 4 GB |
| ดิสก์ | 3 GB (อิมเมจ) + 24 GB (โมเดล AI) + workspace |
| GPU | ไม่จำเป็น (CPU fallback) |

**การติดตั้ง bundle ของ AI คือสิ่งที่ดัน RAM ไปที่ 4 GB** เมื่อไม่มี AI ติดตั้ง แอปจะ idle อยู่ราว 360 MB; เมื่อติดตั้ง bundle ทั้งเจ็ดชุด จะใช้หน่วยความจำ resident ~2.6 GB เพราะ Python AI sidecar โหลดโมเดลไว้ล่วงหน้า (การลบพื้นหลัง, การขยายภาพ, OCR, การถอดเสียง, การตรวจจับใบหน้า, การฟื้นฟู) ตอนเริ่มต้น การติดตั้งที่ไม่ใช่ AI ยังคงเบา; การติดตั้ง AI ต้องการ ≥4 GB

เครื่องมือ AI ส่วนใหญ่ใช้งานได้ดีเยี่ยมบน CPU; มีบางตัวที่ต้องการ GPU จริงๆ วัดบน CPU 4-core สมัยใหม่:

| เครื่องมือ AI | เวลา CPU | ใช้งานบน CPU ได้ไหม? |
|---|---|---|
| การตรวจจับใบหน้า (blur-faces, smart-crop, red-eye), noise-removal | น้อยกว่า 1 วินาที | ได้ |
| OCR, การถอดเสียง, ซับไตเทิล | 1-3 วินาที | ได้ |
| Colorize, การเพิ่มคุณภาพใบหน้า | ~10 วินาที | ได้ |
| การลบ/แทนที่/เบลอพื้นหลัง | ~29 วินาที | ได้ (ต้องรอ) |
| AI upscale (RealESRGAN) | ~33 วินาทีสำหรับภาพเล็ก; หลายนาทีสำหรับภาพใหญ่ | ก้ำกึ่ง - แนะนำ GPU อย่างยิ่ง |
| การฟื้นฟูภาพ (pipeline เต็ม) | หลายนาที | ไม่ได้ - ต้องมี GPU หรือ CPU หลายคอร์ที่เร็ว |

ขนาดการดาวน์โหลดโมเดล AI:

| Bundle | ขนาดดิสก์ |
|---|---|
| การลบพื้นหลัง | 4-5 GB |
| Upscale + Face enhance + Noise removal | 5-6 GB |
| การตรวจจับใบหน้า | 200-300 MB |
| Object eraser + Colorize | 1-2 GB |
| OCR | 5-6 GB |
| การฟื้นฟูภาพ | 4-5 GB |
| **Bundle ทั้งหมด** | **~24 GB** |

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### เต็มรูปแบบ (เครื่องมือ AI บน NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| ทรัพยากร | ข้อกำหนด |
|---|---|
| CPU | 6-8 คอร์ (การเตรียมวิดีโอ + concurrency รันบน CPU แม้จะมี GPU AI) |
| RAM | 8 GB |
| GPU | NVIDIA ที่มี VRAM 8+ GB (แนะนำ 12 GB) |
| ดิสก์ | ~35 GB รวม |

GPU ของ NVIDIA (CUDA) เร่งความเร็วโมเดล AI ที่หนักได้อย่างมาก วัดบน RTX 4070 เทียบกับ CPU สมัยใหม่:

| เครื่องมือ AI | ความเร็วที่เพิ่มด้วย GPU | หมายเหตุ |
|---|---|---|
| AI upscale (RealESRGAN 2×) | **~47×** | ชัยชนะที่ใหญ่ที่สุด - ต่ำกว่าหนึ่งวินาทีเทียบกับ ~33 วินาที (หลายนาทีสำหรับภาพใหญ่) |
| การเพิ่มคุณภาพใบหน้า (CodeFormer) | **~12×** | ~0.9 วินาทีเทียบกับ ~11 วินาที |
| การถอดเสียง (Whisper) | ~4.5× | |
| การลบ/แทนที่/เบลอพื้นหลัง | ~4× | ~7 วินาทีบน GPU เทียบกับ ~29 วินาทีบน CPU |
| Colorize | ~1.8× | |
| OCR, การตรวจจับใบหน้า, red-eye, noise-removal | ~1× | เร็วอยู่แล้วบน CPU - GPU ไม่ช่วย |
| การฟื้นฟูภาพ | ไม่มี | ใช้ CPU เป็นหลักแม้บน GPU (การใช้งาน GPU 0%); CPU ที่เร็วสำคัญกว่า GPU ในกรณีนี้ |

เครื่องมือที่คุ้มค่าที่จะใช้ GPU คือ **upscale, การเพิ่มคุณภาพใบหน้า, การถอดเสียง และการลบพื้นหลัง** การตรวจจับใบหน้า, OCR และ red-eye ใช้ CPU เป็นหลักและเร็วอยู่แล้ว ดังนั้น GPU ไม่ช่วยอะไร

การใช้ VRAM สูงสุดถึง 7.5 GB ระหว่างการ upscale พร้อมการเพิ่มคุณภาพใบหน้า GPU ของ NVIDIA ขนาด 6 GB ใช้ได้กับเครื่องมือ AI ส่วนใหญ่แบบแยกๆ แต่จะล้มเหลวกับการ upscale VRAM ขนาด 8-12 GB จัดการได้ทุกอย่าง

ปัจจุบันยังไม่รองรับการเร่งความเร็ว iGPU ของ Intel/AMD ผ่าน VA-API, Quick Sync หรือ OpenCL สำหรับการอนุมานผล AI การแมป `/dev/dri` เข้าไปในคอนเทนเนอร์ไม่ได้เปิดใช้การเร่งความเร็ว AI ด้วย GPU; SnapOtter จะรันเครื่องมือ AI บน CPU เว้นแต่จะมี NVIDIA CUDA พร้อมใช้งาน

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

คำขอปรับขนาดภาพแบบขนานเทียบกับคอนเทนเนอร์แอปที่จำกัด 4 คอร์ตามค่าเริ่มต้น:

| คำขอพร้อมกัน | เวลาตอบสนองเฉลี่ย | ข้อผิดพลาด |
|---|---|---|
| 1 | 0.4 วินาที | 0 |
| 5 | 1.2 วินาที | 0 |
| 10 | 2.1 วินาที | 0 |

เวลาตอบสนองลดลงต่ำกว่าเชิงเส้นโดยไม่มีข้อผิดพลาดขณะที่ worker pool อิ่มตัว การเพิ่มขีดจำกัด `cpus:` ของคอนเทนเนอร์แอป (หรือใช้โฮสต์ที่มีคอร์มากขึ้น) จะยกเพดานขึ้น โปรดทราบว่างานหนัก (การ transcode วิดีโอ, CPU AI) ยึด worker ไว้ตลอดระยะเวลาทั้งหมด ดังนั้นให้ปรับขนาด CPU ตามจำนวนงานหนักพร้อมกันที่คาดหวัง ไม่ใช่แค่จำนวนคำขอ

### รูปแบบภาพที่รองรับ {#supported-image-formats}

SnapOtter รองรับ **รูปแบบอินพุต 55+ แบบ** และ **รูปแบบเอาต์พุต 14 แบบ** รวมถึงไฟล์ RAW จากกล้อง 20+ แบรนด์, รูปแบบมืออาชีพ (PSD, EPS, OpenEXR, HDR), codec สมัยใหม่ (JPEG XL, AVIF, HEIC, QOI) และรูปแบบทางวิทยาศาสตร์/เกม (FITS, DDS)

ดู [รายการรูปแบบทั้งหมด](/th/guide/supported-formats) สำหรับรายละเอียดของทุกรูปแบบที่รองรับ, decoder ที่ใช้ และการควบคุมคุณภาพที่มี

### ข้อจำกัดที่ทราบ {#known-limitations}

- **Content-aware resize** ล้มเหลวกับภาพขนาดใหญ่ (>5 MP) เนื่องจากข้อจำกัดใน binary ของ caire ทำงานได้ดีกับภาพขนาดเล็กกว่า
- **การถอดรหัส HEIF** ใช้เวลา 13-23 วินาที HEIC (รูปแบบของ Apple) เร็วกว่ามากที่ 0.3-0.9 วินาที
- **OCR ภาษาญี่ปุ่น** ล้มเหลวบน CPU เนื่องจากบั๊ก MKLDNN ของ PaddlePaddle ทำงานได้บน GPU
- **Upscale** หมดเวลาบน CPU สำหรับอะไรก็ตามที่เกินภาพขนาดเล็ก ต้องมี GPU สำหรับการใช้งานจริง
- การเพิ่มคุณภาพใบหน้า **CodeFormer** ช้ากว่า GFPGAN อย่างมาก (53 วินาทีเทียบกับ 2 วินาทีบน GPU) แนะนำ GFPGAN สำหรับกรณีการใช้งานส่วนใหญ่

## Volume {#volumes}

| Mount / Volume | วัตถุประสงค์ | จำเป็นไหม? |
|---|---|---|
| `/data` (แอป) | โมเดล AI, Python venv, ไฟล์ผู้ใช้ | **ใช่** - ข้อมูลสูญหายหากไม่มี |
| `/tmp/workspace` (แอป) | ไฟล์ประมวลผลชั่วคราว (ล้างอัตโนมัติ) | แนะนำ |
| `SnapOtter-pgdata` (postgres) | ไดเรกทอรีข้อมูล PostgreSQL (users, settings, pipelines, jobs) | **ใช่** - ข้อมูลสูญหายหากไม่มี |
| `SnapOtter-redisdata` (redis) | ไฟล์ append-only ของ Redis สำหรับคิวงานที่คงทน | แนะนำ |

### Bind mount เทียบกับ named volume {#bind-mounts-vs-named-volumes}

**Named volume** (แนะนำ) - Docker จัดการสิทธิ์โดยอัตโนมัติ:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mount** - คุณจัดการสิทธิ์เอง ตั้ง `PUID`/`PGID` ให้ตรงกับผู้ใช้บนโฮสต์ของคุณ:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### สิทธิ์การจัดเก็บ {#storage-permissions}

SnapOtter เขียนไปยังสองตำแหน่งขณะรัน: `/data` (ไฟล์ผู้ใช้, log, โมเดล AI และ Python venv) และ `/tmp/workspace` (พื้นที่ทำงานชั่วคราวสำหรับการประมวลผล) ทั้งสองต้องเขียนได้โดยผู้ใช้ที่คอนเทนเนอร์รันอยู่ หากตำแหน่งใดเขียนไม่ได้ คอนเทนเนอร์จะ **ล้มเหลวทันทีตอนเริ่มต้น** พร้อมข้อความระบุชื่อไดเรกทอรี, UID/GID ที่รันอยู่ และวิธีแก้ไข แทนที่จะบูตแบบ "healthy" แล้วล้มเหลวตอนอัปโหลดครั้งแรกด้วยข้อผิดพลาดที่เข้าใจยาก

วิธีการจัดการสิทธิ์ขึ้นอยู่กับว่าคอนเทนเนอร์ถูกเปิดตัวอย่างไร:

**ค่าเริ่มต้น (เริ่มเป็น root แล้ว drop ไปยัง `snapotter`)** - entrypoint เริ่มเป็น root แก้ไขความเป็นเจ้าของของ volume ที่ mount แล้ว drop ไปยังผู้ใช้ที่ไม่มีสิทธิ์พิเศษ `snapotter` ผ่าน `gosu` Named volume ทำงานได้โดยไม่ต้องตั้งค่าใดๆ สำหรับ bind mount ให้ตั้ง `PUID`/`PGID` เป็นผู้ใช้บนโฮสต์ของคุณ (ด้านบน) เพื่อให้ไฟล์ที่มันเขียนเป็นของคุณ

**Kubernetes / OpenShift (non-root ผ่าน `runAsUser`)** - เมื่อเปิดตัวโดยตรงในฐานะผู้ใช้ที่ไม่ใช่ root คอนเทนเนอร์ไม่สามารถ chown volume ได้เอง ดังนั้น orchestrator ต้องทำให้เขียนได้ ตั้ง `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

ไดเรกทอรีที่เขียนได้ของอิมเมจเป็นของกลุ่ม GID 0 และกลุ่มเขียนได้ ดังนั้น pod ที่รันด้วย **UID ใดๆ** บวกกลุ่มเสริม root (ค่าเริ่มต้นของ OpenShift) จึงเขียนได้โดยไม่ต้องมี `chown`

**TrueNAS Scale (และการตั้งค่า "foreign UID" อื่นๆ)** - TrueNAS รันแอปในฐานะผู้ใช้ที่ไม่ใช่ root (มักเป็น `568:568`) และ mount host dataset ที่เป็นของผู้ใช้อื่น ดังนั้นทั้ง entrypoint และ `fsGroup` ไม่ทำให้เขียนได้ด้วยตัวเอง เลือกอย่างใดอย่างหนึ่ง:

- **รันแอปในฐานะ root** (แนะนำ) - ปล่อยผู้ใช้ของแอปไม่ตั้งค่า หรือตั้งเป็น `0` และให้ entrypoint ค่าเริ่มต้นแก้ไขสิทธิ์และ drop ไปยัง `snapotter`
- **รันในฐานะ UID `999`** - ตั้งผู้ใช้/กลุ่มของแอปเป็น `999:999` (ผู้ใช้ `snapotter` ในตัวของ SnapOtter) เพื่อให้ตรงกับความเป็นเจ้าของของอิมเมจ
- **`chown` host dataset** ไปยัง UID ที่คอนเทนเนอร์รันอยู่ จาก TrueNAS shell:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

ข้อผิดพลาดตอนเริ่มต้นจะระบุ UID ที่ถูกต้องที่จะใช้ ดังนั้นวิธีที่เร็วที่สุดคือเริ่มแอปครั้งหนึ่ง อ่านข้อความ แล้ว `chown` (หรือปรับผู้ใช้) ตามนั้น

## ตัวแปรสภาพแวดล้อม {#environment-variables}

| ตัวแปร | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|
| `AUTH_ENABLED` | `true` | เปิด/ปิดข้อกำหนดการเข้าสู่ระบบ |
| `DEFAULT_USERNAME` | `admin` | ชื่อผู้ใช้ admin เริ่มต้น |
| `DEFAULT_PASSWORD` | `admin` | รหัสผ่าน admin เริ่มต้น (บังคับเปลี่ยนตอนเข้าสู่ระบบครั้งแรก) |
| `MAX_UPLOAD_SIZE_MB` | `100` | ขีดจำกัดการอัปโหลดต่อไฟล์ |
| `MAX_BATCH_SIZE` | `100` | จำนวนไฟล์สูงสุดต่อคำขอแบตช์ |
| `RATE_LIMIT_PER_MIN` | `1000` | คำขอ API ต่อนาทีต่อ IP (ตั้ง 0 เพื่อปิด) |
| `MAX_USERS` | `0` (ไม่จำกัด) | จำนวนบัญชีผู้ใช้สูงสุด |
| `TRUST_PROXY` | `true` | เชื่อถือ header X-Forwarded-For จาก reverse proxy |
| `PUID` | `999` | รันเป็น UID นี้ (สำหรับสิทธิ์ bind mount) |
| `PGID` | `999` | รันเป็น GID นี้ (สำหรับสิทธิ์ bind mount) |
| `LOG_LEVEL` | `info` | ระดับความละเอียดของ log: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | จำนวนงานประมวลผล AI แบบขนานสูงสุด |
| `SESSION_DURATION_HOURS` | `168` | อายุของเซสชันการเข้าสู่ระบบ (7 วัน) |
| `CORS_ORIGIN` | (ว่าง) | origin ที่อนุญาตคั่นด้วยเครื่องหมายจุลภาค หรือว่างสำหรับ same-origin |

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

SnapOtter ตั้ง `TRUST_PROXY=true` ตามค่าเริ่มต้น ดังนั้นการจำกัดอัตราและการบันทึก log จะใช้ IP ของ client จริงจาก header `X-Forwarded-For`

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
3. ตั้ง Scheme เป็น `http`, Forward Hostname เป็น `SnapOtter` (หรือ IP คอนเทนเนอร์ของคุณ), Forward Port เป็น `1349`
4. เปิดใช้การรองรับ WebSocket
5. ภายใต้ Advanced เพิ่ม: `client_max_body_size 500M;` และ `proxy_buffering off;`

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

`flush_interval -1` ปิดใช้การบัฟเฟอร์การตอบสนอง ซึ่งจำเป็นสำหรับเหตุการณ์ความคืบหน้า SSE (การประมวลผลแบตช์, เครื่องมือ AI, การติดตั้งฟีเจอร์) การหมดเวลาที่ขยายออกช่วยให้การอัปโหลดไฟล์ขนาดใหญ่เสร็จสมบูรณ์โดยไม่ให้ Caddy ปิดการเชื่อมต่อก่อนเวลา

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

หมายเหตุ: Cloudflare มีขีดจำกัดการอัปโหลด 100 MB บนแผนฟรี ตั้ง `MAX_UPLOAD_SIZE_MB=100` ให้ตรงกัน

## CI/CD {#ci-cd}

ที่เก็บ GitHub มีสาม workflow:

- **ci.yml** - รันโดยอัตโนมัติในทุก push และ PR ทำ lint, typecheck, ทดสอบ, build และตรวจสอบอิมเมจ Docker (โดยไม่ push)
- **release.yml** - เรียกด้วยตนเองผ่าน `workflow_dispatch` รัน semantic-release เพื่อสร้าง version tag และ GitHub release จากนั้น build อิมเมจ Docker แบบหลายสถาปัตยกรรม (amd64 + arm64) และ push ไปยัง Docker Hub (`snapotter/snapotter`) และ GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`)
- **deploy-docs.yml** - build เว็บไซต์เอกสารนี้และปรับใช้ไปยัง Cloudflare Pages เมื่อ push ไปยัง `main`

ในการสร้างรีลีส ไปที่ **Actions > Release > Run workflow** ใน GitHub UI หรือรัน:

```bash
gh workflow run release.yml
```

Semantic-release กำหนดเวอร์ชันจากประวัติคอมมิต Docker tag `latest` ชี้ไปยังรีลีสล่าสุดเสมอ

## Analytics {#analytics}

SnapOtter มี product analytics แบบไม่ระบุตัวตน (รูปแบบการใช้เครื่องมือ, รายงานข้อผิดพลาด) เพื่อช่วยจับบั๊กและปรับปรุงฟีเจอร์ เปิดใช้งานตามค่าเริ่มต้น ไฟล์ ชื่อไฟล์ และข้อมูลส่วนบุคคลของคุณไม่เคยเป็นส่วนหนึ่งของสิ่งนี้ SnapOtter ทำงานได้ตามปกติเมื่อปิด analytics

### การปิด analytics {#disabling-analytics}

การเลือกไม่รับขณะรันเป็นสวิตช์ของ admin คลิกเดียว เปิด Settings > System > Privacy และปิด Anonymous Product Analytics มันจะหยุดทันทีสำหรับทั้ง instance โดยไม่ต้อง build ใหม่

สำหรับอิมเมจที่ไม่มีวันปล่อย analytics ได้เลย ให้ตั้งค่า hard-off ตอน build โดยการ clone ที่เก็บและ build ใหม่:

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
