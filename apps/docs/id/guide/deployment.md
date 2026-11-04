---
description: "Deploy SnapOtter ke produksi dengan Docker. Kebutuhan perangkat keras, pengaturan GPU, dan konfigurasi reverse proxy untuk Nginx, Traefik, dan Cloudflare."
i18n_source_hash: 3821f105f4ba
i18n_provenance: machine
i18n_output_hash: 793e62190df2
i18n_hash_version: 2
---

# Deployment {#deployment}

SnapOtter di-deploy sebagai stack Docker Compose dengan 3 kontainer: image aplikasi SnapOtter, PostgreSQL 17, dan Redis 8. Image aplikasi mendukung **linux/amd64** (dengan NVIDIA CUDA untuk akselerasi AI) dan **linux/arm64** (CPU), sehingga berjalan secara native di server Intel/AMD, Mac Apple Silicon, dan perangkat ARM seperti Raspberry Pi 4/5. Akselerasi iGPU Intel/AMD melalui VA-API, Quick Sync, atau OpenCL saat ini tidak didukung untuk inferensi AI.

Lihat [Image Docker](./docker-tags) untuk pengaturan GPU, contoh Docker Compose, dan penyematan versi.

## Mulai Cepat (CPU) {#quick-start-cpu}

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

Aplikasi kemudian tersedia di `http://localhost:1349`.

Stack di atas terhubung sebagai pemilik database. Mulai SnapOtter 2.3.0, Anda dapat melayani permintaan dengan role yang hanya membaca dan menulis baris; lihat [Role dengan hak akses minimum](./database#least-privilege-roles).

> **Terkena batas laju Docker Hub?** Ganti `snapotter/snapotter:latest` dengan `ghcr.io/snapotter-hq/snapotter:latest` untuk mengunduh dari GitHub Container Registry. Kedua registry menerima image yang sama pada setiap rilis.

## Mulai Cepat (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Untuk akselerasi NVIDIA CUDA pada alat AI yang didukung (penghapusan latar belakang, upscaling, peningkatan wajah):

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

### Verifikasi akselerasi GPU {#verify-gpu-acceleration}

Periksa deteksi CUDA di log:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

Jika alat AI berjalan di CPU padahal `--gpus all` dan NVIDIA Container Toolkit sudah diatur dengan benar, instal ulang bundel yang terdampak (misalnya Background Removal) dari **Settings → AI Features**. Penginstal memulihkan build GPU dari ONNX Runtime, yang bisa tertutup oleh build khusus CPU yang dibawa bundel lain (seperti transkripsi) di lingkungan AI bersama. Jika instal ulang dari UI tidak memulihkan GPU pada image yang lebih lama, lihat perbaikan manual di [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Kebutuhan Perangkat Keras {#hardware-requirements}

Angka-angka ini berasal dari benchmark pada berbagai sistem, mulai dari workstation amd64 modern dengan NVIDIA RTX 4070 hingga Raspberry Pi, dengan menjalankan seluruh katalog alat pada masing-masing sistem dan menyapu batas sumber daya Docker untuk menemukan batas bawah yang sebenarnya.

Menjalankan di ujung bawah tier ini (Pi, laptop lama, VPS 2 GB)? [Pengaturan Sumber Daya Rendah](/id/guide/low-resource) mengubah angka-angka ini menjadi panduan konkret dengan batas yang sudah disetel.

### Referensi Cepat {#quick-reference}

| Tier | Kasus Penggunaan | CPU | RAM | GPU | Penyimpanan |
|------|----------|-----|-----|-----|---------|
| Minimum | Alat non-AI (gambar, file, PDF ringan) ditambah Fast OCR bawaan dan deteksi wajah; satu pengguna; batch kecil | 2 core | 2 GB | Tidak ada | ~7 GB |
| Direkomendasikan | Kelima modalitas termasuk video, PDF, dan bundel AI standar di CPU; batch; beberapa pengguna | 4 core | 4 GB (8 GB untuk inpainting HQ) | Tidak ada | ~25 GB |
| Penuh | Semuanya dengan cepat termasuk AI GPU; batch besar; banyak pengguna | 6-8 core | 8 GB | NVIDIA VRAM 8 GB+ (12 GB nyaman) | ~35 GB |

**Arsitektur: hanya 64-bit** (`linux/amd64` atau `linux/arm64`). SnapOtter berjalan secara native di server Intel/AMD, Mac Apple Silicon, dan board ARM 64-bit termasuk **Raspberry Pi 4 dan 5** (4-8 GB). SnapOtter **tidak** berjalan di ARM 32-bit (`armv7`/`armhf`), karena tidak ada image yang dibuat untuknya, dan juga tidak di board kelas 512 MB seperti Pi Zero, yang berada di bawah batas memori (lihat di bawah).

### Minimum (alat gambar, file, dan PDF ringan; tanpa AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Sumber daya | Kebutuhan |
|---|---|
| CPU | 2 core |
| RAM | 2 GB |
| Disk | ~5,5 GB (image) + volume data |
| GPU | Tidak diperlukan |

Seluruh 222 alat katalog non-AI - gambar (ubah ukuran, pangkas, konversi, kompres, sesuaikan, watermark), video (potong, bisukan, remux), audio (konversi, normalisasi, potong), PDF (gabung, pisah, kompres, putar, lindungi), konversi file, dan preset konversi khusus - berjalan pada perangkat keras sederhana. Sebagian besar operasi selesai dalam waktu kurang dari satu detik bahkan pada file besar: gambar 2,7 MB diubah ukurannya dalam ~0,05 dtk dan di-encode ulang ke WebP dalam ~2 dtk.

Batas bawah memori ini nyata, berdasarkan penyapuan batas sumber daya Docker: **512 MB tidak dapat menjalankan stack** (bahkan satu perubahan ukuran gambar pun dihentikan), **1 GB** menangani operasi satu file tetapi batch multi-file kehabisan memori, dan **2 GB / 2 core** adalah konfigurasi terkecil yang menangani batch non-AI dengan nyaman. Fast OCR bawaan dan bundel `face-detection` juga muat dalam 2 GB, sedangkan bundel AI yang lebih besar (Whisper, LaMa/DDColor, rembg, RealESRGAN, restorasi foto, dan inpainting HQ SD1.5) membutuhkan RAM 4 hingga 8 GB dan langsung ditolak jika memori bebas di bawah batas bawah per bundel.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Satu-satunya pengecualian yang berat di CPU adalah encoding ulang video.** Operasi stream-copy (potong, bisukan, remux kontainer) berlangsung instan, tetapi transcoding ke codec lain bergantung pada CPU. Klip 1080p / 45 detik yang di-encode ulang ke VP9 (WebM) memakan waktu sekitar **~40 dtk** pada CPU modern yang cepat, ~45 dtk pada Apple Silicon, ~80 dtk pada 4-core mobile yang lebih lama, dan **~130 dtk** pada server 4-core yang lebih lama. Jika beban kerja Anda banyak melibatkan video, prioritaskan jumlah core dan kecepatan clock CPU, atau naikkan batas `cpus:` kontainer, karena compose bawaan membatasi aplikasi pada 4 core secara default (8 pada compose GPU).

### Direkomendasikan (alat AI di CPU) {#recommended-ai-tools-on-cpu}

| Sumber daya | Kebutuhan |
|---|---|
| CPU | 4 core |
| RAM | 4 GB |
| Disk | 3 GB (image) + sekitar 20 GB (semua paket AI opsional) + workspace |
| GPU | Tidak diperlukan (fallback ke CPU) |

**Menginstal dan menjalankan bundel AI yang lebih besar adalah alasan rekomendasi naik ke RAM 4 GB.** Tanpa paket opsional terpasang, aplikasi idle di sekitar 360 MB. Alat Python lama berbagi satu sidecar, sedangkan OCR akurat menggunakan dispatcher berumur panjang khusus yang disematkan pada generasi immutable yang aktif. Sebelum aktivasi, penginstal menjalankan smoke test pada kandidat. Kemudian penginstal beralih secara atomik ke dispatcher baru dan menguras dispatcher sebelumnya sebelum garbage collection. Setiap artefak OCR akurat resmi harus lulus suite rilis kasus terburuknya di dalam cgroup 4 GiB, sedangkan rekomendasi host 4 GB menyisakan ruang untuk aplikasi Node.js, Postgres, Redis, antrean, dan pekerjaan konkuren.

Sebagian besar alat AI sangat layak digunakan di CPU; beberapa benar-benar membutuhkan GPU. Diukur pada CPU 4-core modern:

| Alat AI | Waktu CPU | Layak di CPU? |
|---|---|---|
| Deteksi wajah (blur-faces, smart-crop, red-eye), noise-removal | di bawah 1 dtk | Ya |
| OCR, transkripsi, subtitle | 1-3 dtk | Ya |
| Colorize, peningkatan wajah | ~10 dtk | Ya |
| Penghapusan / penggantian / blur latar belakang | ~29 dtk | Ya (Anda harus menunggu) |
| Upscale AI (RealESRGAN) | ~33 dtk untuk gambar kecil; beberapa menit untuk gambar besar | Kurang memadai, GPU sangat disarankan |
| Restorasi foto (pipeline penuh) | beberapa menit | Tidak, butuh GPU atau CPU many-core yang cepat |

SnapOtter sengaja tidak menyertakan unduhan model ini di dalam image Docker. Bundel AI hanya diunduh ketika admin mengaktifkan alat terkait, disimpan di volume `/data/ai` yang persisten, dan dibagikan oleh setiap alat yang bergantung pada tumpukan model yang sama. Ini menjaga ukuran image kontainer akhir tetap kecil sambil tetap memungkinkan instalasi AI penuh mencapai angka penyimpanan yang lebih besar di bawah.

Beberapa alat bergantung pada lebih dari satu bundel bersama. Misalnya, Passport Photo membutuhkan `background-removal` dan `face-detection`; jika `background-removal` sudah terpasang, mengaktifkan Passport Photo hanya mengunduh bundel `face-detection` yang belum ada. Penggunaan ulang yang sama berlaku untuk semua alat AI.

Penyimpanan paket AI opsional dan batas bawah memori CPU (SnapOtter memeriksa memori yang tersedia sebelum mengirim ke sidecar Python dan langsung menolak proses di bawah batas memori bebas bundel):

| Bundel | Ukuran Disk | Batas Bawah Memori CPU |
|---|---|---|
| Deteksi wajah | 200-300 MB | RAM host 2 GB (~0,5 GB bebas) |
| Transkripsi | ~600 MB | RAM host 4 GB (~2 GB bebas) |
| Object eraser + Colorize | 1-2 GB | RAM host 4 GB (~2 GB bebas) |
| OCR akurat (`balanced`/`best`) | unduhan ~208-234 MiB / terpasang ~409-488 MiB | Memori efektif terkonfigurasi 4 GiB (`fast` berjalan di 2 GB) |
| Penghapusan latar belakang | 4-5 GB | RAM host 4 GB (~2,5 GB bebas) |
| Upscale + Peningkatan wajah + Penghilangan noise | 5-6 GB | RAM host 4 GB (~2,5 GB bebas) |
| Restorasi foto | 4-5 GB | RAM host 4 GB (~3 GB bebas) |
| Inpainting Kualitas Tinggi (`inpaint-hq`) | 5-7 GB | RAM host 8 GB (~6 GB bebas) |
| **Semua bundel** | **~25 GB terpasang** | **4 GB (8 GB dengan `inpaint-hq`)** |

Fast OCR sudah tertanam di image melalui Tesseract, menambah sekitar 25 MiB, dan tidak memerlukan paket OCR opsional maupun kebutuhan memori 4 GiB-nya. Fast mendukung `auto`, `en`, `de`, `es`, `fr`, `zh`, dan `ja`, tetapi tidak mendukung bahasa Korea (`ko`) atau Arab (`ar`). Keduanya menggunakan `balanced` atau `best` sehingga memerlukan paket akurat. Paket akurat tersedia di kontainer Linux amd64 dan arm64 resmi dan menjalankan ONNX Runtime di CPU. Host NVIDIA menggunakan runtime OCR CPU yang sama, sehingga OCR tidak bergantung pada versi CUDA atau arsitektur GPU. Runtime akurat membutuhkan memori efektif minimal 4 GiB: batas cgroup kontainer yang dikonfigurasi, atau jika tidak ada, memori host. SnapOtter menolak sistem di bawah minimum kompatibilitas bertanda tangan tersebut sebelum mengunduh paket. Instalasi paket akurat juga ditolak pada arsip bare-metal/prebuilt yang libc dan ABI Python-nya tidak dapat dijamin. Pada host yang tidak didukung itu, OCR Korea dan Arab mengembalikan error inkompatibilitas yang eksplisit dan tidak pernah diam-diam beralih ke Fast. Permintaan Fast eksplisit untuk bahasa Korea mengembalikan `FEATURE_INCOMPATIBLE` dengan alasan `fast-korean-unsupported` sebelum job diantrekan.

Replika yang berbagi `DATA_DIR` yang sama harus menggunakan arsitektur CPU yang sama; sematkan deployment multi-replika dengan node affinity. Replika amd64/arm64 campuran memerlukan volume data terpisah dan deployment SnapOtter yang independen.

Runtime akurat hanya mempertahankan satu generasi aktif dan membersihkan cache unduhannya setelah aktivasi. Untuk rilis ini, instalasi pertama sementara membutuhkan sekitar 620-720 MiB untuk arsip ditambah staging, dan peningkatan versi dapat mencapai puncak mendekati 1,2 GiB selama generasi lama masih aktif. Penginstal menghitung kebutuhan tepatnya dari indeks bertanda tangan dan generasi saat ini sebelum mengunduh atau mengekstrak, dan gagal lebih awal jika volume data terlalu kecil.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Penuh (alat AI di NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Sumber daya | Kebutuhan |
|---|---|
| CPU | 6-8 core (persiapan video + konkurensi berjalan di CPU meskipun AI memakai GPU) |
| RAM | 8 GB |
| GPU | NVIDIA dengan VRAM 8+ GB (12 GB direkomendasikan) |
| Disk | ~35 GB total |

GPU NVIDIA (CUDA) mempercepat model AI yang berat secara dramatis. Diukur pada RTX 4070 dibandingkan CPU modern:

| Alat AI | Percepatan dengan GPU | Catatan |
|---|---|---|
| Upscale AI (RealESRGAN 2×) | **~47×** | Keuntungan terbesar, di bawah satu detik dibandingkan ~33 dtk (beberapa menit pada gambar besar) |
| Peningkatan wajah (CodeFormer) | **~12×** | ~0,9 dtk dibandingkan ~11 dtk |
| Transkripsi (Whisper) | ~4,5× | |
| Penghapusan / penggantian / blur latar belakang | ~4× | ~7 dtk di GPU dibandingkan ~29 dtk di CPU |
| Colorize | ~1,8× | |
| OCR, deteksi wajah, red-eye, noise-removal | ~1× | Sudah cepat di CPU, GPU tidak membantu |
| Restorasi foto | tidak ada | Terikat CPU bahkan pada GPU (pemanfaatan GPU 0%); CPU yang cepat lebih penting daripada GPU di sini |

Alat yang layak memakai GPU adalah **upscale, peningkatan wajah, transkripsi, dan penghapusan latar belakang**. Deteksi wajah, OCR, dan red-eye terikat CPU dan sudah cepat, sehingga GPU tidak menambah apa pun.

Penggunaan VRAM puncak mencapai 7,5 GB selama upscale dengan peningkatan wajah. GPU NVIDIA 6 GB bekerja untuk sebagian besar alat AI secara individual tetapi akan gagal pada upscale. VRAM 8-12 GB menangani semuanya.

Akselerasi iGPU Intel/AMD melalui VA-API, Quick Sync, atau OpenCL saat ini tidak didukung untuk inferensi AI. Memetakan `/dev/dri` ke dalam kontainer tidak mengaktifkan akselerasi GPU AI; SnapOtter akan menjalankan alat AI di CPU kecuali NVIDIA CUDA tersedia.

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

### Pengguna Konkuren {#concurrent-users}

Permintaan ubah ukuran gambar paralel terhadap kontainer aplikasi bawaan yang dibatasi 4 core:

| Permintaan Konkuren | Rata-rata Waktu Respons | Error |
|---|---|---|
| 1 | 0,4 dtk | 0 |
| 5 | 1,2 dtk | 0 |
| 10 | 2,1 dtk | 0 |

Waktu respons menurun secara sub-linear tanpa error saat pool worker jenuh. Menaikkan batas `cpus:` kontainer aplikasi (atau memakai host dengan lebih banyak core) meningkatkan batas atasnya. Perhatikan bahwa job berat (transcode video, AI di CPU) menahan satu worker selama seluruh durasinya, jadi sesuaikan CPU dengan jumlah job berat konkuren yang Anda harapkan, bukan hanya jumlah permintaan.

### Format Gambar yang Didukung {#supported-image-formats}

SnapOtter mendukung **55+ format input** dan **14 format output**, termasuk file RAW dari 20+ merek kamera, format profesional (PSD, EPS, OpenEXR, HDR), codec modern (JPEG XL, AVIF, HEIC, QOI), dan format ilmiah/game (FITS, DDS).

Lihat [daftar format lengkap](/id/guide/supported-formats) untuk detail setiap format yang didukung, decoder yang digunakan, dan kontrol kualitas yang tersedia.

### Keterbatasan yang Diketahui {#known-limitations}

- **Content-aware resize** crash pada gambar besar (>5 MP) karena keterbatasan pada binary caire. Berfungsi baik dengan gambar yang lebih kecil.
- **Decode HEIF** memakan waktu 13-23 detik. HEIC (varian Apple) jauh lebih cepat, yaitu 0,3-0,9 detik.
- **Upscale** mengalami timeout di CPU untuk gambar yang lebih dari kecil. GPU diperlukan untuk penggunaan praktis.
- Peningkatan wajah **CodeFormer** jauh lebih lambat daripada GFPGAN (53 dtk vs 2 dtk di GPU). GFPGAN direkomendasikan untuk sebagian besar kasus penggunaan.

## Volume {#volumes}

| Mount / Volume | Tujuan | Wajib? |
|---|---|---|
| `/data` (app) | Model AI, venv Python, file pengguna | **Ya** - file hilang tanpa ini |
| `/tmp/workspace` (app) | File pemrosesan sementara (dibersihkan otomatis) | Direkomendasikan |
| `SnapOtter-pgdata` (postgres) | Direktori data PostgreSQL (pengguna, pengaturan, pipeline, job) | **Ya** - data hilang tanpa ini |
| `SnapOtter-redisdata` (redis) | File append-only Redis untuk antrean job yang tahan lama | Direkomendasikan |

### Bind mount vs. named volume {#bind-mounts-vs-named-volumes}

**Named volume** (direkomendasikan) - Docker mengelola izin secara otomatis:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mount** - Anda yang mengelola izin. Atur `PUID`/`PGID` agar sesuai dengan pengguna host Anda:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Izin penyimpanan {#storage-permissions}

SnapOtter menulis ke dua lokasi saat runtime: `/data` (file pengguna, log, model AI dan venv Python) dan `/tmp/workspace` (scratch pemrosesan sementara). Keduanya harus dapat ditulis oleh pengguna yang menjalankan kontainer. Jika salah satunya tidak, kontainer **langsung gagal saat startup** dengan pesan yang menyebutkan direktori, UID/GID yang berjalan, dan cara memperbaikinya, alih-alih tampak "healthy" lalu gagal pada unggahan pertama dengan error yang membingungkan. Direktori log (`LOG_DIR`, `/data/logs` di image) diperiksa dengan cara yang sama, di setiap mode penyimpanan, karena log tetap lokal meskipun file berada di S3.

Cara izin ditangani bergantung pada bagaimana kontainer dijalankan:

**Default (dimulai sebagai root, turun ke `snapotter`)** - entrypoint dimulai sebagai root, memperbaiki kepemilikan volume yang di-mount, lalu turun ke pengguna `snapotter` tanpa hak istimewa melalui `gosu`. Named volume bekerja tanpa konfigurasi. Untuk bind mount, atur `PUID`/`PGID` ke pengguna host Anda (di atas) agar file yang ditulisnya dimiliki oleh Anda.

**Kubernetes / OpenShift (non-root melalui `runAsUser`)** - dijalankan langsung sebagai pengguna non-root, kontainer tidak dapat melakukan chown pada volume sendiri, sehingga orkestrator harus membuatnya dapat ditulis. Atur `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Direktori yang dapat ditulis pada image dimiliki grup GID 0 dan dapat ditulis oleh grup, sehingga pod yang berjalan dengan **UID sembarang** plus grup suplementer root (default OpenShift) dapat menulis tanpa `chown`.

**TrueNAS Scale (dan setup "UID asing" lainnya)** - TrueNAS menjalankan aplikasi sebagai pengguna non-root (sering `568:568`) dan me-mount dataset host yang dimiliki pengguna lain, sehingga baik entrypoint maupun `fsGroup` tidak dapat membuatnya dapat ditulis dengan sendirinya. Pilih salah satu:

- **Jalankan aplikasi sebagai root** (direkomendasikan) - biarkan pengguna aplikasi tidak diatur atau atur ke `0`, dan biarkan entrypoint default memperbaiki izin lalu turun ke `snapotter`.
- **Jalankan sebagai UID `999`** - atur pengguna/grup aplikasi ke `999:999` (pengguna `snapotter` bawaan SnapOtter) agar sesuai dengan kepemilikan image.
- **`chown` dataset host** ke UID yang digunakan kontainer, dari shell TrueNAS:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Error startup menyebutkan UID yang tepat untuk digunakan, jadi cara tercepat adalah menjalankan aplikasi sekali, membaca pesannya, lalu `chown` (atau menyesuaikan pengguna) sesuai kebutuhan.

## Variabel Lingkungan {#environment-variables}

| Variabel | Default | Deskripsi |
|---|---|---|
| `AUTH_ENABLED` | `true` | Aktifkan/nonaktifkan kewajiban login |
| `DEFAULT_USERNAME` | `admin` | Username admin awal |
| `DEFAULT_PASSWORD` | `admin` | Kata sandi admin awal (wajib diganti saat login pertama) |
| `MAX_UPLOAD_SIZE_MB` | `0` (tanpa batas) | Batas unggah per file dalam MB. Image dikirim dengan `0`; build dari sumber dimulai dari 100 |
| `MAX_BATCH_SIZE` | `0` (tanpa batas) | Maksimum file per permintaan batch. Image dikirim dengan `0`; build dari sumber dimulai dari 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | Permintaan API per menit per IP (atur 0 untuk menonaktifkan) |
| `MAX_USERS` | `0` (tanpa batas) | Jumlah maksimum akun pengguna |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Peer mana yang boleh menetapkan IP klien melalui `X-Forwarded-For`. Secara default hanya jaringan privat |
| `PUID` | `999` | Jalankan sebagai UID ini (untuk izin bind mount) |
| `PGID` | `999` | Jalankan sebagai GID ini (untuk izin bind mount) |
| `LOG_LEVEL` | `info` | Tingkat detail log: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (otomatis) | Maksimum job pemrosesan AI paralel |
| `SESSION_DURATION_HOURS` | `168` | Masa berlaku sesi login (7 hari) |
| `CORS_ORIGIN` | (kosong) | Origin yang diizinkan dipisahkan koma, atau kosong untuk same-origin |

### Proxy keluar dan CA privat {#outbound-proxy-and-private-ca}

Kontainer resmi mengaktifkan dukungan environment-proxy Node. Jika SnapOtter harus menjangkau repositori runtime OCR atau layanan HTTPS lain melalui proxy perusahaan, atur `HTTPS_PROXY` (dan `HTTP_PROXY` bila diperlukan). Atur `NO_PROXY` ke daftar host yang dipisahkan koma yang harus dijangkau secara langsung, seperti Postgres, Redis, dan penyimpanan objek internal.

Jika proxy atau layanan internal ditandatangani oleh certificate authority privat, mount sertifikat CA secara read-only dan arahkan `NODE_EXTRA_CA_CERTS` ke sertifikat tersebut. File harus sudah ada saat proses Node dimulai:

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

Simpan kredensial proxy di luar file Compose (misalnya dalam file atau secret `.env` yang terlindungi). Jangan menonaktifkan verifikasi TLS: indeks OCR bertanda tangan mengautentikasi metadata rilis, sedangkan validasi TLS normal tetap melindungi transport dan setiap permintaan keluar lainnya.

## Health Check {#health-check}

Kontainer menyertakan health check bawaan:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse Proxy {#reverse-proxy}

`TRUST_PROXY` secara default bernilai `loopback,linklocal,uniquelocal`, sehingga SnapOtter hanya mempercayai `X-Forwarded-For` dari peer di jaringan privat. Reverse proxy pada host yang sama, pada jaringan Docker, atau pada LAN Anda dipercaya secara bawaan, yang berarti pembatasan laju, pembatas brute-force login, log audit, dan allowlist IP enterprise semuanya melihat IP klien yang sebenarnya tanpa konfigurasi.

Atur `TRUST_PROXY=true` hanya ketika proxy di depan menjangkau SnapOtter dari alamat **publik**, misalnya load balancer cloud pada jaringan yang berbeda. Pada instance yang terekspos langsung, nilai tersebut membuat `request.ip` dapat dikendalikan penyerang, karena pemanggil yang mengganti-ganti header mendapat bucket batas laju baru untuk setiap permintaan.

Dua hal yang perlu diketahui sebelum Anda mengukur IP klien. Docker Desktop di macOS dan Windows melayani port yang dipublikasikan melalui proxy userland yang menulis ulang setiap alamat sumber menjadi gateway VM `192.168.65.1`, sehingga tidak ada nilai `TRUST_PROXY` yang dapat memulihkan klien sebenarnya di sana; deploy di Linux untuk apa pun yang menghadap internet. Dan pada platform mana pun, mengakses port yang dipublikasikan melalui `localhost` teramati sebagai gateway bridge, bukan sebagai klien Anda, sehingga uji localhost tidak memberi tahu apa pun tentang bagaimana klien sebenarnya diatribusikan. Tabel lengkap nilai `TRUST_PROXY` dan catatan Docker Desktop ada di [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Dua hal penting untuk setiap proxy di bawah: izinkan isi permintaan yang besar (unggahan), dan jangan buffer respons. Proxy yang mem-buffer respons merusak progres SSE dan, yang lebih terlihat, membuat unduhan file besar "dimulai tetapi tidak pernah selesai", karena proxy menahan seluruh file sebelum meneruskannya. SnapOtter mengirim `X-Accel-Buffering: no` pada unduhan sehingga nginx melakukan streaming meskipun buffering dibiarkan aktif di tempat lain, tetapi proxy selain nginx perlu menonaktifkan buffering respons secara eksplisit (ditunjukkan di setiap konfigurasi di bawah). Jika unduhan berhenti di tengah jalan, proxy yang mem-buffer di depan adalah hal pertama yang perlu diperiksa.

Catatan tentang HSTS: API mengirim `Strict-Transport-Security` pada setiap respons itu sendiri, sehingga proxy yang meneruskan header respons (semua konfigurasi di bawah melakukannya) tidak memerlukan pengaturan HSTS sendiri. Hanya jika proxy Anda dikonfigurasi untuk menghapus atau menimpa header respons upstream, Anda perlu mempertahankan header tersebut atau menambahkannya kembali di edge.

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

### Deployment di bawah subpath {#subpath}

Untuk melayani `https://example.com/snapotter`, atur `BASE_PATH=/snapotter` di environment
kontainer SnapOtter dan mulai ulang. File Compose CPU dan GPU resmi
juga menerima `BASE_PATH` dari shell Anda atau file `.env` Compose. Image yang sama
bekerja di path mana pun; tidak perlu rebuild frontend.

`BASE_PATH` menerima segmen yang dipisahkan garis miring berisi huruf, angka, `_`, atau
`-`, termasuk path bersarang seperti `/apps/snapotter`. Garis miring di akhir
bersifat opsional. Biarkan kosong (default), atau atur `/`, untuk deployment root.

Pada blok server HTTPS Nginx Anda yang ada, gunakan:

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

Contoh ini mempertahankan prefiks. Proxy yang menghapus `/snapotter` sebelum
meneruskan juga didukung. Health check internal tetap dapat menggunakan
`/api/v1/health`. Untuk OIDC atau SAML, atur juga
`EXTERNAL_URL=https://example.com/snapotter` dan perbarui URL callback identity provider agar menyertakan `/snapotter/api/auth/oidc/callback` atau
`/snapotter/api/auth/saml/callback` secara berurutan.

Skrip API tetap bekerja tanpa perubahan: URL dalam respons API, seperti
`downloadUrl` sebuah alat, diawali dengan `/api/` apa pun nilai `BASE_PATH`. Tambahkan ke
URL dasar instance Anda (`https://example.com/snapotter` + `/api/v1/download/...`)
alih-alih menyelesaikannya terhadap root domain.

Buka UI melalui URL berprefiks (`https://example.com/snapotter`). Browser
yang datang tanpa prefiks akan diarahkan ke sana secara otomatis; hanya permintaan
API yang diharapkan mencapai aplikasi tanpa prefiks. Jika log menyebutkan
`Requests arrive under /snapotter/ but BASE_PATH is empty`, proxy Anda
meneruskan prefiks yang tidak dideklarasikan oleh `BASE_PATH`: atur `BASE_PATH` ke prefiks itu,
atau hapus prefiks di proxy.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Tambahkan Proxy Host baru
2. Atur Domain Name ke domain Anda
3. Atur Scheme ke `http`, Forward Hostname ke `SnapOtter` (atau IP kontainer Anda), Forward Port ke `1349`
4. Aktifkan dukungan WebSocket
5. Di bawah Advanced, tambahkan: `client_max_body_size 500M;` dan `proxy_buffering off;`

Header `Strict-Transport-Security` dari API diteruskan melalui NPM apa adanya; toggle HSTS pada tab SSL bersifat opsional sebagai tambahan.

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

Traefik meneruskan header respons upstream tanpa perubahan, sehingga header `Strict-Transport-Security` dari API sampai ke browser tanpa middleware `headers`. Jika Anda sudah menjalankan middleware yang menulis ulang header respons, pastikan middleware itu membiarkan header tersebut utuh.

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

`flush_interval -1` menonaktifkan buffering respons, yang diperlukan agar event progres SSE (pemrosesan batch, alat AI, instalasi fitur) dan unduhan file besar mengalir melalui streaming alih-alih macet. Timeout yang diperpanjang memungkinkan unggahan file besar selesai tanpa Caddy menutup koneksi lebih awal. Caddy juga meneruskan header `Strict-Transport-Security` dari API tanpa diubah, sehingga tidak diperlukan direktif `header` untuk HSTS.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Catatan: Cloudflare memiliki batas unggahan 100 MB pada paket gratis. Atur `MAX_UPLOAD_SIZE_MB=100` agar sesuai.

Tunnel meneruskan header respons API, termasuk `Strict-Transport-Security`, sehingga tidak diperlukan konfigurasi HSTS di dashboard (pengaturan HSTS edge milik Cloudflare bersifat opsional sebagai tambahan).

## Pemecahan Masalah {#troubleshooting}

### "Postgres not reachable: EAI_AGAIN" tepat setelah start pertama yang gagal {#eai-again-after-failed-first-start}

Jika `docker compose up -d` yang pertama gagal di tengah jalan (port yang sudah dipakai adalah penyebab yang umum), percobaan ulang `up -d` biasa dapat memulai kontainer aplikasi tanpa menyambungkannya ke jaringan compose. Aplikasi kemudian crash-loop dengan:

```
Postgres not reachable: EAI_AGAIN
```

sementara `docker ps` menunjukkan postgres healthy. Error tersebut nyata tetapi menunjuk kontainer yang salah: tanpa jaringan, DNS untuk hostname `postgres` sama sekali tidak dapat di-resolve, dan kebijakan restart mengulang kegagalan yang sama tanpa henti.

Perbaiki apa pun yang merusak start pertama (biasanya: bebaskan port), lalu paksa kontainer aplikasi dibuat ulang agar tersambung kembali ke jaringan:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: dapat dijangkau dari perangkat lain, tetapi tidak dari PC itu sendiri {#windows-wsl2-loopback}

Dengan Docker berjalan di dalam WSL2 (setup Windows yang umum), stack dapat dijangkau dari setiap mesin lain di jaringan Anda sementara `http://localhost:1349` mengalami timeout pada host Windows itu sendiri, bahkan dengan mode jaringan mirrored WSL diaktifkan. Port tersebut tidak pernah muncul di `netstat` Windows, dan tidak ada yang salah dengan kontainernya.

Buka aplikasi dari perangkat lain, atau dari dalam distro menggunakan alamatnya sendiri (`hostname -I` di shell WSL). Jika penerusan localhost kebetulan bekerja pada versi WSL Anda, anggap itu sebagai bonus dan bukan sesuatu yang diandalkan.

## CI/CD {#ci-cd}

Repositori GitHub memiliki tiga workflow:

- **ci.yml** - Berjalan otomatis pada setiap push dan PR. Melakukan lint, typecheck, test, build, dan memvalidasi image Docker (tanpa push).
- **release.yml** - Dipicu secara manual melalui `workflow_dispatch`. Menjalankan semantic-release untuk membuat tag versi dan rilis GitHub, lalu membangun image Docker multi-arsitektur (amd64 + arm64) dan mem-push ke Docker Hub (`snapotter/snapotter`) dan GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Membangun situs dokumentasi ini dan men-deploy-nya ke Cloudflare Pages saat push ke `main`.

Untuk membuat rilis, buka **Actions > Release > Run workflow** di UI GitHub, atau jalankan:

```bash
gh workflow run release.yml
```

Semantic-release menentukan versi dari riwayat commit. Tag Docker `latest` selalu menunjuk ke rilis terbaru.

## Analitik {#analytics}

SnapOtter menyertakan analitik produk anonim (pola penggunaan alat, laporan error) untuk membantu menemukan bug dan meningkatkan fitur. Analitik ini aktif secara default. File, nama file, dan data pribadi Anda tidak pernah menjadi bagian darinya. SnapOtter bekerja normal dengan analitik dinonaktifkan.

### Menonaktifkan analitik {#disabling-analytics}

Opt-out saat runtime berupa toggle admin satu klik. Buka Settings > System > Privacy dan matikan Anonymous Product Analytics. Analitik berhenti seketika untuk seluruh instance, tanpa perlu rebuild.

Untuk image yang tidak pernah dapat mengirim analitik, atur hard-off saat build dengan meng-clone repositori dan melakukan rebuild:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Atau tambahkan build arg ke `docker-compose.yml` Anda yang sudah ada:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```

