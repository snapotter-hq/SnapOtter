---
description: "Deploy SnapOtter ke produksi dengan Docker. Persyaratan perangkat keras, penyiapan GPU, dan konfigurasi reverse proxy untuk Nginx, Traefik, dan Cloudflare."
i18n_source_hash: 6b6957060fa6
i18n_provenance: machine
i18n_output_hash: 45dafa6467df
---

# Deployment {#deployment}

SnapOtter diterapkan sebagai stack Docker Compose 3 kontainer: image aplikasi SnapOtter, PostgreSQL 17, dan Redis 8. Image aplikasi mendukung **linux/amd64** (dengan NVIDIA CUDA untuk akselerasi AI) dan **linux/arm64** (CPU), sehingga berjalan secara native di server Intel/AMD, Mac Apple Silicon, dan perangkat ARM seperti Raspberry Pi 4/5. Akselerasi iGPU Intel/AMD melalui VA-API, Quick Sync, atau OpenCL saat ini tidak didukung untuk inferensi AI.

Lihat [Docker Image](./docker-tags) untuk penyiapan GPU, contoh Docker Compose, dan penyematan versi.

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

Aplikasi kemudian tersedia di `http://localhost:1349`.

> **Terkena batas laju Docker Hub?** Ganti `snapotter/snapotter:latest` dengan `ghcr.io/snapotter-hq/snapotter:latest` untuk menarik dari GitHub Container Registry sebagai gantinya. Kedua registry menerima image yang sama pada setiap rilis.

## Quick Start (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Untuk akselerasi NVIDIA CUDA pada perkakas AI (penghapusan latar belakang, upscaling, penyempurnaan wajah, OCR):

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

Periksa deteksi CUDA di log:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Persyaratan Perangkat Keras {#hardware-requirements}

Angka-angka ini berasal dari benchmark di berbagai sistem, mulai dari workstation amd64 modern dengan NVIDIA RTX 4070 hingga Raspberry Pi, menjalankan seluruh katalog perkakas pada masing-masing dan menyapu batas sumber daya Docker untuk menemukan batas bawah yang sebenarnya.

### Referensi Singkat {#quick-reference}

| Tingkat | Kasus Penggunaan | CPU | RAM | GPU | Penyimpanan |
|------|----------|-----|-----|-----|---------|
| Minimum | Perkakas gambar, file, dan PDF ringan; satu pengguna; batch kecil | 2 core | 2 GB | Tidak ada | ~7 GB |
| Direkomendasikan | Kelima modalitas termasuk video, PDF, dan AI di CPU; batch; beberapa pengguna | 4 core | 4 GB | Tidak ada | ~25 GB |
| Penuh | Semuanya dengan kecepatan termasuk AI GPU; batch besar; banyak pengguna | 6-8 core | 8 GB | NVIDIA 8 GB+ VRAM (12 GB nyaman) | ~35 GB |

**Arsitektur: hanya 64-bit** (`linux/amd64` atau `linux/arm64`). SnapOtter berjalan secara native di server Intel/AMD, Mac Apple Silicon, dan board ARM 64-bit termasuk **Raspberry Pi 4 dan 5** (4-8 GB). SnapOtter **tidak** berjalan di ARM 32-bit (`armv7`/`armhf`), tidak ada image yang dibuat untuknya, maupun di board kelas 512 MB seperti Pi Zero, yang berada di bawah batas bawah memori (lihat di bawah).

### Minimum (perkakas gambar, file, dan PDF ringan; tanpa AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Sumber Daya | Persyaratan |
|---|---|
| CPU | 2 core |
| RAM | 2 GB |
| Disk | ~5.5 GB (image) + volume data |
| GPU | Tidak diperlukan |

Semua 222 perkakas katalog non-AI, yaitu gambar (resize, crop, convert, compress, adjust, watermark), video (trim, mute, remux), audio (convert, normalize, trim), PDF (merge, split, compress, rotate, protect), konversi file, dan preset konversi khusus, berjalan pada perangkat keras sederhana. Sebagian besar operasi selesai jauh di bawah satu detik bahkan pada file besar: gambar 2.7 MB diubah ukurannya dalam ~0.05 d dan dikodekan ulang ke WebP dalam ~2 d.

Batas bawah memori itu nyata, dari penyapuan batas sumber daya Docker: **512 MB tidak dapat memulai stack** (bahkan satu resize gambar pun dihentikan), **1 GB** menangani operasi satu file tetapi batch multi-file kehabisan memori, dan **2 GB / 2 core** adalah konfigurasi terkecil yang menangani batch dengan nyaman.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Satu-satunya pengecualian yang berat CPU adalah pengkodean ulang video.** Operasi stream-copy (trim, mute, remux kontainer) instan, tetapi transcoding ke codec berbeda bergantung pada CPU. Klip 1080p / 45 detik yang dikodekan ulang ke VP9 (WebM) memakan waktu kira-kira **~40 d** pada CPU modern yang cepat, ~45 d di Apple Silicon, ~80 d pada 4-core mobile lama, dan **~130 d** pada server 4-core lama. Jika beban kerja Anda banyak video, prioritaskan core CPU dan kecepatan clock, atau naikkan batas `cpus:` kontainer. Compose yang disertakan membatasi aplikasi pada 4 core secara default (8 pada compose GPU).

### Direkomendasikan (perkakas AI di CPU) {#recommended-ai-tools-on-cpu}

| Sumber Daya | Persyaratan |
|---|---|
| CPU | 4 core |
| RAM | 4 GB |
| Disk | 3 GB (image) + 24 GB (model AI) + workspace |
| GPU | Tidak diperlukan (fallback CPU) |

**Memasang bundle AI-lah yang mendorong RAM ke 4 GB.** Tanpa AI terpasang, aplikasi menganggur di sekitar 360 MB; dengan ketujuh bundle terpasang aplikasi menahan ~2.6 GB resident, karena sidecar AI Python memuat model-modelnya di awal (penghapusan latar belakang, upscaling, OCR, transkripsi, deteksi wajah, restorasi) saat startup. Instalasi non-AI tetap ringan; instalasi AI membutuhkan ≥4 GB.

Sebagian besar perkakas AI sepenuhnya dapat digunakan di CPU; beberapa benar-benar menginginkan GPU. Diukur pada CPU 4-core modern:

| Perkakas AI | Waktu CPU | Dapat digunakan di CPU? |
|---|---|---|
| Deteksi wajah (blur-faces, smart-crop, red-eye), noise-removal | di bawah 1 d | Ya |
| OCR, transkripsi, subtitle | 1-3 d | Ya |
| Colorize, penyempurnaan wajah | ~10 d | Ya |
| Penghapusan / penggantian / blur latar belakang | ~29 d | Ya (Anda akan menunggu) |
| AI upscale (RealESRGAN) | ~33 d kecil; menit pada gambar besar | Marginal, GPU sangat direkomendasikan |
| Restorasi foto (pipeline penuh) | beberapa menit | Tidak, butuh GPU atau CPU banyak-core yang cepat |

SnapOtter sengaja tidak memasukkan unduhan model ini ke dalam image Docker. Bundle AI ditarik hanya ketika admin mengaktifkan perkakas terkait, disimpan di volume `/data/ai` yang persisten, dan dibagi oleh setiap perkakas yang bergantung pada stack model yang sama. Ini menjaga image kontainer akhir tetap kecil sekaligus tetap memungkinkan instalasi AI penuh mencapai angka penyimpanan yang lebih besar di bawah.

Beberapa perkakas bergantung pada lebih dari satu bundle bersama. Misalnya, Passport Photo membutuhkan `background-removal` dan `face-detection`; jika `background-removal` sudah terpasang, mengaktifkan Passport Photo hanya mengunduh bundle `face-detection` yang hilang. Penggunaan ulang yang sama berlaku di semua perkakas AI.

Ukuran unduhan model AI:

| Bundle | Ukuran Disk |
|---|---|
| Penghapusan latar belakang | 4-5 GB |
| Upscale + Penyempurnaan wajah + Penghapusan noise | 5-6 GB |
| Deteksi wajah | 200-300 MB |
| Object eraser + Colorize | 1-2 GB |
| OCR | 5-6 GB |
| Restorasi foto | 4-5 GB |
| **Semua bundle** | **~24 GB** |

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Penuh (perkakas AI di NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Sumber Daya | Persyaratan |
|---|---|
| CPU | 6-8 core (persiapan video + konkurensi berjalan di CPU bahkan dengan AI GPU) |
| RAM | 8 GB |
| GPU | NVIDIA dengan 8+ GB VRAM (12 GB direkomendasikan) |
| Disk | ~35 GB total |

GPU NVIDIA (CUDA) secara dramatis mempercepat model AI yang berat. Diukur pada RTX 4070 vs CPU modern:

| Perkakas AI | Peningkatan kecepatan dengan GPU | Catatan |
|---|---|---|
| AI upscale (RealESRGAN 2×) | **~47×** | Kemenangan terbesar, di bawah satu detik vs ~33 d (menit pada gambar besar) |
| Penyempurnaan wajah (CodeFormer) | **~12×** | ~0.9 d vs ~11 d |
| Transkripsi (Whisper) | ~4.5× | |
| Penghapusan / penggantian / blur latar belakang | ~4× | ~7 d di GPU vs ~29 d di CPU |
| Colorize | ~1.8× | |
| OCR, deteksi wajah, red-eye, noise-removal | ~1× | Sudah cepat di CPU, GPU tidak membantu |
| Restorasi foto | tidak ada | Bergantung CPU bahkan di GPU (0% utilisasi GPU); CPU cepat lebih penting daripada GPU di sini |

Perkakas yang layak menggunakan GPU adalah **upscale, penyempurnaan wajah, transkripsi, dan penghapusan latar belakang**. Deteksi wajah, OCR, dan red-eye bergantung CPU dan sudah cepat, jadi GPU tidak menambah apa pun.

Penggunaan VRAM puncak mencapai 7.5 GB selama upscale dengan penyempurnaan wajah. GPU NVIDIA 6 GB bekerja untuk sebagian besar perkakas AI secara individual tetapi akan gagal pada upscale. VRAM 8-12 GB menangani semuanya.

Akselerasi iGPU Intel/AMD melalui VA-API, Quick Sync, atau OpenCL saat ini tidak didukung untuk inferensi AI. Memetakan `/dev/dri` ke dalam kontainer tidak mengaktifkan akselerasi AI GPU; SnapOtter akan menjalankan perkakas AI di CPU kecuali NVIDIA CUDA tersedia.

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

### Pengguna Bersamaan {#concurrent-users}

Permintaan resize gambar paralel terhadap kontainer aplikasi yang dibatasi 4-core secara default:

| Permintaan Bersamaan | Rata-rata Waktu Respons | Kesalahan |
|---|---|---|
| 1 | 0.4d | 0 |
| 5 | 1.2d | 0 |
| 10 | 2.1d | 0 |

Waktu respons menurun secara sub-linear tanpa kesalahan saat pool worker menjadi jenuh. Menaikkan batas `cpus:` kontainer aplikasi (atau menggunakan host dengan lebih banyak core) mengangkat batas atas. Perhatikan bahwa job berat (transcode video, AI CPU) menahan satu worker selama durasi penuhnya, jadi ukur CPU sesuai jumlah job berat bersamaan yang Anda harapkan, bukan hanya jumlah permintaan.

### Format Gambar yang Didukung {#supported-image-formats}

SnapOtter mendukung **55+ format input** dan **14 format output**, termasuk file RAW dari 20+ merek kamera, format profesional (PSD, EPS, OpenEXR, HDR), codec modern (JPEG XL, AVIF, HEIC, QOI), dan format ilmiah/gaming (FITS, DDS).

Lihat [daftar format lengkap](/id/guide/supported-formats) untuk detail setiap format yang didukung, decoder yang digunakan, dan kontrol kualitas yang tersedia.

### Batasan yang Diketahui {#known-limitations}

- **Content-aware resize** crash pada gambar besar (>5 MP) karena batasan pada binary caire. Bekerja baik dengan gambar yang lebih kecil.
- **HEIF decode** memakan 13-23 detik. HEIC (varian Apple) jauh lebih cepat pada 0.3-0.9 detik.
- **OCR Jepang** gagal di CPU karena bug MKLDNN PaddlePaddle. Bekerja di GPU.
- **Upscale** kehabisan waktu di CPU untuk apa pun di luar gambar kecil. GPU diperlukan untuk penggunaan praktis.
- **CodeFormer** penyempurnaan wajah jauh lebih lambat daripada GFPGAN (53d vs 2d di GPU). GFPGAN direkomendasikan untuk sebagian besar kasus penggunaan.

## Volume {#volumes}

| Mount / Volume | Tujuan | Diperlukan? |
|---|---|---|
| `/data` (app) | Model AI, venv Python, file pengguna | **Ya**, kehilangan file tanpanya |
| `/tmp/workspace` (app) | File pemrosesan sementara (dibersihkan otomatis) | Direkomendasikan |
| `SnapOtter-pgdata` (postgres) | Direktori data PostgreSQL (pengguna, pengaturan, pipeline, job) | **Ya**, kehilangan data tanpanya |
| `SnapOtter-redisdata` (redis) | File append-only Redis untuk antrean job yang durable | Direkomendasikan |

### Bind mount vs. named volume {#bind-mounts-vs-named-volumes}

**Named volume** (direkomendasikan), Docker mengelola izin secara otomatis:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mount**, Anda mengelola izin. Atur `PUID`/`PGID` agar cocok dengan pengguna host Anda:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Izin penyimpanan {#storage-permissions}

SnapOtter menulis ke dua lokasi saat runtime: `/data` (file pengguna, log, model AI dan venv Python) dan `/tmp/workspace` (scratch pemrosesan sementara). Keduanya harus dapat ditulis oleh pengguna tempat kontainer berjalan. Jika salah satunya tidak, kontainer **gagal cepat saat startup** dengan pesan yang menyebutkan direktori, UID/GID yang berjalan, dan cara memperbaikinya, alih-alih boot "healthy" lalu gagal pada unggahan pertama dengan kesalahan samar.

Bagaimana izin ditangani bergantung pada cara kontainer diluncurkan:

**Default (mulai sebagai root, turun ke `snapotter`)**, entrypoint mulai sebagai root, memperbaiki kepemilikan volume yang di-mount, lalu turun ke pengguna `snapotter` yang tidak berhak istimewa melalui `gosu`. Named volume bekerja tanpa konfigurasi. Untuk bind mount, atur `PUID`/`PGID` ke pengguna host Anda (di atas) agar file yang ditulisnya dimiliki oleh Anda.

**Kubernetes / OpenShift (non-root melalui `runAsUser`)**, diluncurkan langsung sebagai pengguna non-root, kontainer tidak dapat chown volume sendiri, jadi orkestrator harus membuatnya dapat ditulis. Atur `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Direktori yang dapat ditulis pada image dimiliki oleh grup GID 0 dan dapat ditulis grup, sehingga pod yang berjalan dengan **UID sembarang** ditambah grup suplementer root (default OpenShift) dapat menulis tanpa `chown`.

**TrueNAS Scale (dan penyiapan "UID asing" lainnya)**, TrueNAS menjalankan aplikasi sebagai pengguna non-root (sering `568:568`) dan me-mount dataset host yang dimiliki oleh pengguna berbeda, sehingga baik entrypoint maupun `fsGroup` tidak membuatnya dapat ditulis dengan sendirinya. Pilih salah satu:

- **Jalankan aplikasi sebagai root** (direkomendasikan), biarkan pengguna aplikasi tidak diatur atau atur ke `0`, dan biarkan entrypoint default memperbaiki izin dan turun ke `snapotter`.
- **Jalankan sebagai UID `999`**, atur pengguna/grup aplikasi ke `999:999` (pengguna `snapotter` bawaan SnapOtter) agar cocok dengan kepemilikan image.
- **`chown` dataset host** ke UID tempat kontainer berjalan, dari shell TrueNAS:

  ```bash
  # Gunakan UID dari kesalahan startup (atau jalankan `id` di dalam kontainer)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Kesalahan startup menyebutkan UID persis yang harus digunakan, jadi jalur tercepat adalah memulai aplikasi sekali, membaca pesannya, lalu `chown` (atau menyesuaikan pengguna) sesuai kebutuhan.

## Variabel Lingkungan {#environment-variables}

| Variabel | Default | Deskripsi |
|---|---|---|
| `AUTH_ENABLED` | `true` | Aktifkan/nonaktifkan persyaratan login |
| `DEFAULT_USERNAME` | `admin` | Username admin awal |
| `DEFAULT_PASSWORD` | `admin` | Kata sandi admin awal (dipaksa ganti saat login pertama) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Batas unggahan per file |
| `MAX_BATCH_SIZE` | `100` | Maksimum file per permintaan batch |
| `RATE_LIMIT_PER_MIN` | `1000` | Permintaan API per menit per IP (atur 0 untuk menonaktifkan) |
| `MAX_USERS` | `0` (tak terbatas) | Maksimum akun pengguna |
| `TRUST_PROXY` | `true` | Percayai header X-Forwarded-For dari reverse proxy |
| `PUID` | `999` | Jalankan sebagai UID ini (untuk izin bind mount) |
| `PGID` | `999` | Jalankan sebagai GID ini (untuk izin bind mount) |
| `LOG_LEVEL` | `info` | Verbositas log: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (otomatis) | Maksimum job pemrosesan AI paralel |
| `SESSION_DURATION_HOURS` | `168` | Masa berlaku sesi login (7 hari) |
| `CORS_ORIGIN` | (kosong) | Origin yang diizinkan dipisahkan koma, atau kosong untuk same-origin |

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

SnapOtter mengatur `TRUST_PROXY=true` secara default sehingga pembatasan laju dan logging menggunakan IP klien sebenarnya dari header `X-Forwarded-For`.

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

1. Tambahkan Proxy Host baru
2. Atur Domain Name ke domain Anda
3. Atur Scheme ke `http`, Forward Hostname ke `SnapOtter` (atau IP kontainer Anda), Forward Port ke `1349`
4. Aktifkan dukungan WebSocket
5. Di bawah Advanced, tambahkan: `client_max_body_size 500M;` dan `proxy_buffering off;`

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

`flush_interval -1` menonaktifkan buffering respons, yang diperlukan untuk event progres SSE (pemrosesan batch, perkakas AI, instalasi fitur). Timeout yang diperpanjang memungkinkan unggahan file besar selesai tanpa Caddy menutup koneksi terlalu dini.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Catatan: Cloudflare memiliki batas unggahan 100 MB pada paket gratis. Atur `MAX_UPLOAD_SIZE_MB=100` agar cocok.

## CI/CD {#ci-cd}

Repositori GitHub memiliki tiga workflow:

- **ci.yml**, Berjalan otomatis pada setiap push dan PR. Melakukan lint, typecheck, test, build, dan memvalidasi image Docker (tanpa push).
- **release.yml**, Dipicu secara manual melalui `workflow_dispatch`. Menjalankan semantic-release untuk membuat tag versi dan rilis GitHub, lalu membangun image Docker multi-arch (amd64 + arm64) dan mendorong ke Docker Hub (`snapotter/snapotter`) dan GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml**, Membangun situs dokumentasi ini dan menerapkannya ke Cloudflare Pages saat push ke `main`.

Untuk membuat rilis, buka **Actions > Release > Run workflow** di UI GitHub, atau jalankan:

```bash
gh workflow run release.yml
```

Semantic-release menentukan versi dari riwayat commit. Tag Docker `latest` selalu menunjuk ke rilis terbaru.

## Analitik {#analytics}

SnapOtter menyertakan analitik produk anonim (pola penggunaan perkakas, laporan kesalahan) untuk membantu menangkap bug dan meningkatkan fitur. Ini aktif secara default. File Anda, nama file, dan data pribadi tidak pernah menjadi bagian dari ini. SnapOtter bekerja normal dengan analitik dinonaktifkan.

### Menonaktifkan analitik {#disabling-analytics}

Opt-out runtime adalah toggle admin satu klik. Buka Settings > System > Privacy dan matikan Anonymous Product Analytics. Analitik berhenti segera untuk seluruh instance, tanpa rebuild diperlukan.

Untuk image yang tidak akan pernah memancarkan analitik, atur hard-off build-time dengan mengkloning repositori dan membangun ulang:

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
