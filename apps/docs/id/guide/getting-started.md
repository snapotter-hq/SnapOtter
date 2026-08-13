---
description: "Pasang SnapOtter dengan Docker dalam satu perintah. Termasuk penyiapan Docker Compose, membangun dari sumber, dan gambaran lengkap fitur."
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: fbe4a9bf48c8
i18n_hash_version: 2
---

# Memulai {#getting-started}

::: tip Coba sebelum memasang
Jelajahi UI lengkap di [demo.snapotter.com](https://demo.snapotter.com), tanpa pendaftaran atau instalasi diperlukan.
:::

## Quick Start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Kontainer tunggal ini menjalankan semua yang diperlukan: tanpa set `DATABASE_URL`, ia memulai PostgreSQL dan Redis sendiri pada antarmuka loopback (mode tertanam) dan menyimpan semua data dalam volume `SnapOtter-data`. Ini adalah cara tercepat untuk mencoba SnapOtter atau self-host di homelab. Untuk produksi, gunakan [tumpukan Docker Compose kanonik](#docker-compose), yang menyimpan PostgreSQL dan Redis dalam containernya masing-masing. Mode tertanam berjalan sebagai root (default) dan mati secara otomatis segera setelah Anda mengatur `DATABASE_URL`.

Memasang di Raspberry Pi, laptop lama, atau VPS kecil? Lihat [Penyiapan Sumber Daya Rendah](/id/guide/low-resource) untuk panduan yang sudah disetel dan apa yang bisa diharapkan dari perangkat keras terbatas.

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

Membutuhkan [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Kembali ke CPU secara otomatis ketika CUDA tidak tersedia. Akselerasi Intel/AMD iGPU melalui VA-API, Quick Sync, atau OpenCL tidak didukung untuk inferensi AI saat ini. Lihat [Tag Docker](/id/guide/docker-tags) untuk tolok ukur. Jika alat AI berjalan pada CPU meskipun `--gpus all`, lihat [Verifikasi akselerasi GPU](/id/guide/deployment#verify-gpu-acceleration).
:::

::: details Juga di GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Kedua registry mempublikasikan image yang sama pada setiap rilis.
:::

## Penulisan Docker {#docker-compose}

Gunakan file produksi yang dikelola dan diuji pada setiap rilis alih-alih menyalin contoh Compose yang disingkat dari halaman ini:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.2.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

[`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.2.0/docker/docker-compose.yml) kanonik mencakup keempat volume runtime, health check, batasan sumber daya, konfigurasi Redis yang tahan lama, gambar database/cache yang disematkan, dan pengerasan kontainer saat ini. Ubah kata sandi admin default segera setelah login pertama. Untuk penerapan yang dapat direproduksi, sematkan gambar aplikasi SnapOtter ke tag rilis atau intisari yang Anda verifikasi, bukan mengikuti `latest`.

Lihat [Konfigurasi](/id/guide/configuration) untuk semua variabel lingkungan dan [Keamanan & Pengerasan](/id/guide/security) untuk rahasia, kebijakan jaringan, dan panduan pencadangan.

## Membangun dari Sumber {#build-from-source}

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

## Apa yang Bisa Anda Lakukan {#what-you-can-do}

### Pemrosesan File (200+ Perkakas) {#file-processing-200-tools}

| Modalitas | Jumlah | Contoh Perkakas |
|----------|-------|---------------|
| **Gambar** | 107 | Resize, Crop, Compress, Convert, Remove Background, Upscale, OCR, Watermark, Collage, Colorize, GIF Tools, preset format |
| **Video** | 57 | Trim, Crop, Compress, Convert, Merge, Extract Audio, Auto Subtitles, Video to GIF, Resize, Stabilize, preset format |
| **Audio** | 27 | Trim, Merge, Convert, Normalize, Noise Reduction, Transcribe, Pitch Shift, Fade, Ringtone Maker, preset format |
| **PDF / Dokumen** | 29 | Merge, Split, Compress, OCR, Watermark, Redact, Word to PDF, Excel to PDF, Rotate, Protect, Repair |
| **File** | 23 | CSV to JSON, JSON to XML, Merge CSVs, Split CSV, Create ZIP, Extract ZIP, Chart Maker, YAML/JSON |

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

## Gunakan dari Ponsel Anda {#use-it-from-your-phone}

SnapOtter berjalan di browser seluler, dan Anda dapat memasangnya sebagai aplikasi. Buka instance Anda di ponsel, lalu:

- **iPhone / iPad (Safari)**: ketuk Bagikan, lalu **Tambah ke Layar Utama**.
- **Android (Chrome)**: buka menu browser dan ketuk **Instal aplikasi**.

Aplikasi yang terpasang terbuka di jendelanya sendiri, langsung ke instance Anda.

Satu catatan: browser hanya menawarkan opsi instal melalui HTTPS. Alamat HTTP biasa di LAN Anda tetap berfungsi baik di tab browser; untuk instalasi yang sebenarnya, tempatkan instance di belakang reverse proxy dengan sertifikat (lihat [panduan deployment](/id/guide/deployment)).

Di ponsel dan tablet, perkakas gambar menampilkan tombol **Ambil foto** di samping tombol unggah. Potret struk atau papan tulis, dan hasilnya langsung masuk ke perkakas.
