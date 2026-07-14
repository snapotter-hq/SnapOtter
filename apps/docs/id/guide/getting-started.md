---
description: "Pasang SnapOtter dengan Docker dalam satu perintah. Termasuk penyiapan Docker Compose, membangun dari sumber, dan gambaran lengkap fitur."
i18n_output_hash: 6df615cedb03
i18n_source_hash: 24724b5595b2
i18n_provenance: human
---

# Memulai {#getting-started}

::: tip Coba sebelum memasang
Jelajahi UI lengkap di [demo.snapotter.com](https://demo.snapotter.com), tanpa pendaftaran atau instalasi diperlukan.
:::

## Quick Start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Kontainer tunggal ini menjalankan semua yang dibutuhkannya: tanpa `DATABASE_URL` yang diatur, ia memulai PostgreSQL dan Redis sendiri pada antarmuka loopback (mode embedded) dan menyimpan semua data di volume `SnapOtter-data`. Ini adalah cara tercepat untuk mencoba SnapOtter atau self-host di homelab. Untuk produksi, jalankan stack [Docker Compose](#docker-compose) di bawah, yang menjaga PostgreSQL dan Redis di kontainer mereka sendiri. Mode embedded berjalan sebagai root (default) dan mati secara otomatis segera setelah Anda mengatur `DATABASE_URL`.

Anda akan diminta mengubah kata sandi Anda saat login pertama.

::: tip Analitik Produk Anonim
SnapOtter menyertakan analitik produk anonim secara default. Untuk mematikannya, buka **Settings → System → Privacy** dan matikan **Anonymous Product Analytics**. Analitik berhenti segera untuk seluruh instance.

Anda juga dapat mengatur variabel lingkungan `SNAPOTTER_TELEMETRY=0` (`false` dan `off` juga berfungsi) untuk menonaktifkan semua telemetri untuk instance tanpa rebuild.

Pemantauan kesalahan didukung oleh [Sentry](https://sentry.io), yang mensponsori SnapOtter melalui program open-source-nya.

Untuk detail tentang apa yang dikumpulkan, lihat [Apa yang dikumpulkan SnapOtter](/id/guide/telemetry).
:::

::: tip Akselerasi NVIDIA CUDA
Tambahkan `--gpus all` untuk penghapusan latar belakang yang dipercepat NVIDIA CUDA, peningkatan skala, penyempurnaan wajah, dan pemulihan. OCR tetap berbasis CPU dan bekerja pada image yang sama dengan atau tanpa akses GPU:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Membutuhkan [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Otomatis kembali ke CPU ketika CUDA tidak tersedia. Akselerasi iGPU Intel/AMD melalui VA-API, Quick Sync, atau OpenCL saat ini tidak didukung untuk inferensi AI. Lihat [Docker Tags](/id/guide/docker-tags) untuk benchmark.
:::

::: details Juga di GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Kedua registry mempublikasikan image yang sama pada setiap rilis.
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
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
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

Lihat [Configuration](/id/guide/configuration) untuk semua variabel lingkungan.

## Membangun dari Sumber {#build-from-source}

**Prasyarat:** Node.js 22+, pnpm 9+, Docker (untuk Postgres + Redis), Python 3.10+ (untuk fitur AI), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## Apa yang Bisa Anda Lakukan {#what-you-can-do}

### Pemrosesan File (200+ Perkakas) {#file-processing-200-tools}

| Modalitas | Jumlah | Contoh Perkakas |
|----------|-------|---------------|
| **Gambar** | 105 | Resize, Crop, Compress, Convert, Remove Background, Upscale, OCR, Watermark, Collage, Colorize, GIF Tools, preset format |
| **Video** | 57 | Trim, Crop, Compress, Convert, Merge, Extract Audio, Auto Subtitles, Video to GIF, Resize, Stabilize, preset format |
| **Audio** | 27 | Trim, Merge, Convert, Normalize, Noise Reduction, Transcribe, Pitch Shift, Fade, Ringtone Maker, preset format |
| **PDF / Dokumen** | 42 | Merge, Split, Compress, OCR, Watermark, Redact, Word to PDF, Excel to PDF, Rotate, Protect, Repair |
| **File** | 10 | CSV to JSON, JSON to XML, Merge CSVs, Split CSV, Create ZIP, Extract ZIP, Chart Maker, YAML/JSON |

### Pipeline {#pipelines}

Rangkai perkakas menjadi alur kerja multi-langkah dan terapkan ke satu gambar atau seluruh batch:

1. Buka **Pipelines** di sidebar.
2. Tambahkan langkah (perkakas apa pun, pengaturan apa pun).
3. Jalankan pada satu file, atau seluruh batch sekaligus.
4. Simpan pipeline untuk digunakan kembali nanti.

Pipeline mengizinkan 20 langkah secara default. Atur `MAX_PIPELINE_STEPS=0` untuk membuat batas tak terbatas.

### Pustaka File {#file-library}

Setiap file yang Anda proses dapat disimpan ke pustaka **Files** Anda. SnapOtter melacak riwayat versi lengkap sehingga Anda dapat menelusuri setiap langkah pemrosesan dari unggahan asli hingga output akhir.

Penyimpanan bersifat eksplisit: hasil yang Anda simpan ke pustaka disimpan hingga Anda menghapusnya, sedangkan hasil yang Anda proses dan biarkan tidak disimpan dihapus otomatis setelah 72 jam (dapat dikonfigurasi melalui `FILE_MAX_AGE_HOURS`).

### REST API & API Key {#rest-api-api-keys}

Setiap perkakas dapat diakses melalui HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Buat API key di bawah **Settings → API Keys**. Lihat [referensi REST API](/id/api/rest) untuk semua endpoint, atau kunjungi [http://localhost:1349/api/docs](http://localhost:1349/api/docs) untuk referensi interaktif.

### Multi-Pengguna & Tim {#multi-user-teams}

Aktifkan beberapa pengguna dengan kontrol akses berbasis peran:

- **Admin**: akses penuh, kelola pengguna, tim, pengaturan, semua file/pipeline/API key
- **Pengguna**: gunakan perkakas, kelola file/pipeline/API key sendiri

Buat tim di bawah **Settings → Teams** untuk mengelompokkan pengguna.

Atur `AUTH_ENABLED=true` (atau `false` untuk penggunaan tunggal/pribadi tanpa login).
