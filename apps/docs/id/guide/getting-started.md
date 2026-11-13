---
description: "Instal SnapOtter dengan Docker dalam satu perintah. Mencakup pengaturan Docker Compose, build dari source, dan ikhtisar fitur lengkap."
i18n_source_hash: aa8428189808
i18n_provenance: machine
i18n_output_hash: 24448a4a0811
i18n_hash_version: 2
---

# Memulai {#getting-started}

::: tip Coba sebelum menginstal
Jelajahi UI lengkap di [demo.snapotter.com](https://demo.snapotter.com) - tanpa pendaftaran atau instalasi.
:::

## Mulai Cepat {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Satu container ini menjalankan semua yang dibutuhkan: tanpa `DATABASE_URL` yang diatur, container memulai PostgreSQL dan Redis sendiri pada antarmuka loopback (mode embedded) dan menyimpan semua data di volume `SnapOtter-data`. Ini adalah cara tercepat untuk mencoba SnapOtter atau self-host di homelab. Untuk produksi, gunakan [stack Docker Compose kanonis](#docker-compose), yang menjaga PostgreSQL dan Redis dalam container masing-masing. Mode embedded berjalan sebagai root (default) dan mati secara otomatis begitu Anda mengatur `DATABASE_URL`.

Menginstal di Raspberry Pi, laptop lama, atau VPS kecil? Lihat [Setup Sumber Daya Rendah](/id/guide/low-resource) untuk panduan yang sudah disetel dan apa yang bisa diharapkan dari perangkat keras terbatas.

Anda akan diminta mengganti password pada login pertama.

::: tip Analitik Produk Anonim
SnapOtter menyertakan analitik produk anonim secara default. Untuk mematikannya, buka **Settings → System → Privacy** dan matikan **Anonymous Product Analytics**. Analitik berhenti seketika untuk seluruh instance.

Anda juga dapat mengatur variabel lingkungan `SNAPOTTER_TELEMETRY=0` (`false` dan `off` juga berfungsi) untuk menonaktifkan semua telemetri pada instance tanpa build ulang.

Pemantauan error didukung oleh [Sentry](https://sentry.io), yang mensponsori SnapOtter melalui program open-source mereka.

Untuk detail tentang apa yang dikumpulkan, lihat [Apa yang dikumpulkan SnapOtter](/id/guide/telemetry).
:::

::: tip Akselerasi NVIDIA CUDA
Tambahkan `--gpus all` untuk penghapusan latar belakang, upscaling, peningkatan wajah, dan pemulihan yang dipercepat NVIDIA CUDA. OCR tetap berbasis CPU dan berfungsi pada image yang sama dengan atau tanpa akses GPU:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Memerlukan [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Otomatis beralih ke CPU ketika CUDA tidak tersedia. Akselerasi iGPU Intel/AMD melalui VA-API, Quick Sync, atau OpenCL saat ini belum didukung untuk inferensi AI. Lihat [Docker Tags](/id/guide/docker-tags) untuk benchmark. Jika alat AI berjalan di CPU meskipun `--gpus all`, lihat [Verifikasi akselerasi GPU](/id/guide/deployment#verify-gpu-acceleration).
:::

::: details Tersedia juga di GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Kedua registry menerbitkan image yang sama pada setiap rilis.
:::

## Docker Compose {#docker-compose}

Gunakan file produksi yang dirawat dan diuji pada setiap rilis, jangan menyalin contoh Compose ringkas dari halaman ini:

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

[`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) kanonis mencakup keempat volume runtime, health check, batas sumber daya, konfigurasi Redis yang tahan lama, image database/cache yang disematkan, dan hardening container terkini. Ganti password admin default segera setelah login pertama. Untuk deployment yang dapat direproduksi, sematkan image aplikasi SnapOtter ke tag rilis atau digest yang sudah Anda verifikasi, alih-alih mengikuti `latest`.

Lihat [Konfigurasi](/id/guide/configuration) untuk semua variabel lingkungan dan [Keamanan & Hardening](/id/guide/security) untuk secret, kebijakan jaringan, dan panduan backup.

## Build dari Source {#build-from-source}

**Prasyarat:** Node.js 22.22+, pnpm 9+, Docker (untuk Postgres + Redis), Python 3.11+ (untuk fitur AI), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1351](http://localhost:1351)
- Backend: [http://localhost:13490](http://localhost:13490)

## Yang Dapat Anda Lakukan {#what-you-can-do}

### Pemrosesan File (200+ Alat) {#file-processing-200-tools}

| Modalitas | Jumlah | Contoh Alat |
|----------|-------|---------------|
| **Gambar** | 112 | Resize, Crop, Compress, Convert, Remove Background, Upscale, OCR, Watermark, Collage, Colorize, GIF Tools, preset format |
| **Video** | 57 | Trim, Crop, Compress, Convert, Merge, Extract Audio, Auto Subtitles, Video to GIF, Resize, Stabilize, preset format |
| **Audio** | 27 | Trim, Merge, Convert, Normalize, Noise Reduction, Transcribe, Pitch Shift, Fade, Ringtone Maker, preset format |
| **PDF / Dokumen** | 35 | Merge, Split, Compress, OCR, Watermark, Redact, Word to PDF, Excel to PDF, Rotate, Protect, Repair |
| **File** | 23 | CSV to JSON, JSON to XML, Merge CSVs, Split CSV, Create ZIP, Extract ZIP, Chart Maker, YAML/JSON |

### Pipeline {#pipelines}

Rangkai alat menjadi alur kerja multi-langkah dan terapkan pada satu gambar atau satu batch penuh:

1. Buka **Pipelines** di sidebar.
2. Tambahkan langkah (alat apa pun, pengaturan apa pun).
3. Jalankan pada satu file - atau seluruh batch sekaligus.
4. Simpan pipeline untuk digunakan kembali nanti.

Pipeline mengizinkan 20 langkah secara default. Atur `MAX_PIPELINE_STEPS=0` untuk membuat batasnya tanpa batas.

### Pustaka File {#file-library}

Setiap file yang Anda proses dapat disimpan ke pustaka **Files** Anda. SnapOtter melacak riwayat versi lengkap sehingga Anda dapat menelusuri setiap langkah pemrosesan dari unggahan asli hingga hasil akhir.

Penyimpanan bersifat eksplisit: hasil yang Anda simpan ke pustaka dipertahankan sampai Anda menghapusnya, sedangkan hasil yang Anda proses dan biarkan tidak tersimpan dibersihkan otomatis setelah 72 jam (dapat dikonfigurasi melalui `FILE_MAX_AGE_HOURS`).

### REST API & API Key {#rest-api-api-keys}

Setiap alat dapat diakses melalui HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Buat API key di bawah **Settings → API Keys**. Lihat [referensi REST API](/id/api/rest) untuk semua endpoint, atau kunjungi [http://localhost:1349/api/docs](http://localhost:1349/api/docs) untuk referensi interaktif.

### Multi-Pengguna & Tim {#multi-user-teams}

Aktifkan banyak pengguna dengan kontrol akses berbasis peran:

- **Admin**: akses penuh - kelola pengguna, tim, pengaturan, semua file/pipeline/API key
- **User**: gunakan alat, kelola file/pipeline/API key sendiri

Buat tim di bawah **Settings → Teams** untuk mengelompokkan pengguna.

Atur `AUTH_ENABLED=true` (atau `false` untuk satu pengguna/penggunaan pribadi tanpa login).

## Gunakan dari Ponsel Anda {#use-it-from-your-phone}

SnapOtter berfungsi di browser seluler, dan Anda dapat menginstalnya sebagai aplikasi. Buka instance Anda di ponsel, lalu:

- **iPhone / iPad (Safari):** ketuk Share, lalu **Add to Home Screen**.
- **Android (Chrome):** buka menu browser dan ketuk **Install app**.

Aplikasi yang terinstal terbuka di jendelanya sendiri, langsung ke instance Anda.

Satu kendala: browser hanya menawarkan prompt instalasi melalui HTTPS. Alamat HTTP biasa di LAN Anda tetap berfungsi baik di tab browser; untuk instalasi yang sebenarnya, letakkan instance di belakang reverse proxy dengan sertifikat (lihat [panduan deployment](/id/guide/deployment)).

Di ponsel dan tablet, alat gambar menampilkan tombol **Take photo** di samping tombol unggah. Foto struk atau papan tulis dan hasilnya langsung masuk ke alat.
