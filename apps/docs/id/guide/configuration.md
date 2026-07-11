---
description: "Semua variabel lingkungan SnapOtter dengan default-nya. Konfigurasi auth, penyimpanan, model AI, analitik, dan lainnya."
i18n_source_hash: 8e9e9ca2840c
i18n_provenance: human
i18n_output_hash: 48af4392804f
---

# Konfigurasi {#configuration}

Semua konfigurasi dilakukan melalui variabel lingkungan. Setiap variabel memiliki default yang masuk akal, jadi SnapOtter bekerja langsung tanpa mengatur satu pun dari mereka.

## Variabel lingkungan {#environment-variables}

### Server {#server}

| Variabel | Default | Deskripsi |
|---|---|---|
| `PORT` | `1349` | Port tempat server mendengarkan. |
| `RATE_LIMIT_PER_MIN` | `1000` | Permintaan maksimum per menit per IP. Setel ke 0 untuk menonaktifkan pembatasan laju. |
| `CORS_ORIGIN` | (kosong) | Origin yang diizinkan dipisahkan koma untuk CORS, atau kosong untuk hanya same-origin. |
| `LOG_LEVEL` | `info` | Verbositas log. Salah satu dari: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `true` | Percayai header `X-Forwarded-For` dari reverse proxy. Setel ke `false` jika tidak di belakang proxy. |

### Autentikasi {#authentication}

| Variabel | Default | Deskripsi |
|---|---|---|
| `AUTH_ENABLED` | `false` | Setel ke `true` untuk mewajibkan login. Image Docker default ke `true`. |
| `DEFAULT_USERNAME` | `admin` | Nama pengguna untuk akun admin awal. Hanya digunakan pada run pertama. |
| `DEFAULT_PASSWORD` | `admin` | Kata sandi untuk akun admin awal. Ubah ini setelah login pertama. |
| `MAX_USERS` | `0` (tak terbatas) | Jumlah maksimum akun pengguna terdaftar. Setel ke 0 untuk tak terbatas. |
| `SESSION_DURATION_HOURS` | `168` | Masa hidup sesi login dalam jam (default adalah 7 hari). |
| `SKIP_MUST_CHANGE_PASSWORD` | - | Setel ke nilai apa pun yang tidak kosong untuk melewati prompt ganti-kata-sandi paksa pada login pertama |

### Penyimpanan {#storage}

| Variabel | Default | Deskripsi |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` atau `s3`. S3/MinIO memerlukan lisensi dengan fitur s3_storage. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@postgres:5432/snapotter` | String koneksi PostgreSQL. |
| `REDIS_URL` | `redis://redis:6379` | String koneksi Redis (digunakan untuk antrean job BullMQ). |
| `WORKSPACE_PATH` | `./tmp/workspace` | Direktori untuk file sementara selama pemrosesan. Dibersihkan secara otomatis. |
| `FILES_STORAGE_PATH` | `./data/files` | Direktori untuk file pengguna persisten (gambar yang diunggah, hasil yang disimpan). |

### Mode tertanam {#embedded-mode}

Jalankan image tanpa `DATABASE_URL` dan tanpa `REDIS_URL` dan ia memulai PostgreSQL 17 dan Redis-nya sendiri di dalam kontainer, terikat ke loopback, dengan semua data pada volume `/data`. Ini memulihkan pengalaman `docker run` satu perintah untuk quick start, homelab, dan upgrade dari 1.x. Ini adalah jalur kenyamanan, bukan deployment produksi: untuk produksi, jalankan stack Compose 3 kontainer dengan PostgreSQL dan Redis terpisah. Mode tertanam memerlukan menjalankan kontainer sebagai root dan tidak kompatibel dengan runtime UID arbitrer (OpenShift, Kubernetes `runAsNonRoot`); gunakan Compose di sana.

| Variabel | Default | Deskripsi |
|---|---|---|
| `EMBEDDED` | `auto` | Diaktifkan otomatis saat `DATABASE_URL` dan `REDIS_URL` keduanya tidak diatur. Setel ke `0` untuk menonaktifkannya (aplikasi kemudian gagal cepat jika tidak ada `DATABASE_URL`/`REDIS_URL` eksternal yang diatur, alih-alih diam-diam memulai basis data dalam kontainer). |
| `REDIS_MAXMEMORY` | `512mb` | Batas memori untuk Redis tertanam (hanya mode tertanam). Turunkan pada host dengan memori terbatas seperti Raspberry Pi. |

Upgrade dari 1.x: letakkan `snapotter.db` lama Anda di `/data/snapotter.db` dalam volume dan mode tertanam mengimpornya ke PostgreSQL tertanam pada boot pertama. Impor berjalan sekali; boot berikutnya melewatinya.

Catatan telemetri: mode tertanam mewarisi default analitik image seperti konfigurasi lainnya. Image yang diterbitkan dikirim dengan analitik aktif; build dengan `--build-arg SNAPOTTER_ANALYTICS=off`, atau gunakan opt-out admin dalam aplikasi, untuk menonaktifkannya.

### Batas pemrosesan {#processing-limits}

| Variabel | Default | Deskripsi |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `100` | Ukuran file maksimum per unggahan dalam megabyte. Setel ke 0 untuk tak terbatas. |
| `MAX_BATCH_SIZE` | `100` | Jumlah maksimum file dalam satu permintaan batch. Setel ke 0 untuk tak terbatas. |
| `CONCURRENT_JOBS` | `0` (otomatis) | Jumlah job batch yang berjalan secara paralel. Setel ke 0 untuk deteksi otomatis berdasarkan inti CPU yang tersedia. |
| `MAX_MEGAPIXELS` | `0` (tak terbatas) | Resolusi gambar maksimum yang diizinkan dalam megapiksel. Setel ke 0 untuk tak terbatas. |
| `MAX_WORKER_THREADS` | `0` (otomatis) | Thread worker maksimum untuk pemrosesan gambar. Setel ke 0 untuk deteksi otomatis berdasarkan inti CPU yang tersedia. |
| `PROCESSING_TIMEOUT_S` | `0` (tanpa batas) | Waktu pemrosesan maksimum per permintaan dalam detik. Setel ke 0 untuk tanpa timeout. |
| `MAX_PIPELINE_STEPS` | `20` | Jumlah maksimum langkah dalam sebuah pipeline. Setel ke 0 untuk tanpa batas. |
| `MAX_CANVAS_PIXELS` | `0` (tanpa batas) | Ukuran kanvas maksimum dalam piksel untuk gambar keluaran. Setel ke 0 untuk tanpa batas. |
| `MAX_SVG_SIZE_MB` | `0` (tak terbatas) | Ukuran file SVG maksimum dalam megabyte. Setel ke 0 untuk tak terbatas. |
| `MAX_SPLIT_GRID` | `100` | Dimensi kisi maksimum untuk tool split gambar. |
| `MAX_PDF_PAGES` | `0` (tak terbatas) | Jumlah maksimum halaman PDF untuk konversi PDF-ke-image. Setel ke 0 untuk tak terbatas. |

### Pembersihan {#cleanup}

| Variabel | Default | Deskripsi |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Berapa lama hasil pemrosesan yang tidak disimpan (unggahan mentah dan keluaran tool) disimpan sebelum penghapusan otomatis. File yang Anda simpan secara eksplisit ke pustaka Files tidak terpengaruh dan bertahan hingga Anda menghapusnya. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Seberapa sering job pembersihan berjalan. |

### Tampilan {#appearance}

| Variabel | Default | Deskripsi |
|---|---|---|
| `DEFAULT_THEME` | `light` | Tema default untuk sesi baru. `light` atau `dark`. |
| `DEFAULT_LOCALE` | `en` | Bahasa antarmuka default. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Tata letak tool default. `sidebar` atau `fullscreen`. |

### Izin Docker {#docker-permissions}

| Variabel | Default | Deskripsi |
|---|---|---|
| `PUID` | `999` | Jalankan proses kontainer sebagai UID ini. Setel agar cocok dengan pengguna host Anda untuk bind mount (`id -u`). |
| `PGID` | `999` | Jalankan proses kontainer sebagai GID ini. Setel agar cocok dengan grup host Anda untuk bind mount (`id -g`). |

## Contoh Docker {#docker-example}

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

## Volume {#volumes}

Stack Docker Compose menggunakan empat volume:

- `/data` (app) - Model AI, venv Python, dan file pengguna. Pasang ini untuk menyimpan file yang diunggah dan bundel AI yang terpasang di seluruh restart.
- `/tmp/workspace` (app) - Penyimpanan sementara untuk file yang sedang diproses. Ini bisa efemeral, tetapi memasangnya menghindari pengisian lapisan writable kontainer.
- `SnapOtter-pgdata` (postgres) - Direktori data PostgreSQL. Ini menyimpan semua data relasional (pengguna, pengaturan, pipeline, job, log audit). Cadangkan melalui `pg_dump` atau snapshot volume.
- `SnapOtter-redisdata` (redis) - File append-only Redis untuk antrean job yang tahan lama.
