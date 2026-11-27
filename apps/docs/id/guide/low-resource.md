---
i18n_source_hash: 919652d75ac6
i18n_provenance: machine
i18n_output_hash: 702c8d573432
i18n_hash_version: 2
---
# Setup Sumber Daya Rendah {#low-resource-setups}

SnapOtter berjalan baik di perangkat keras kecil: Raspberry Pi 4 atau 5, laptop lama, atau VPS 2 GB. Halaman ini adalah panduan praktis untuk mesin-mesin tersebut: apa yang bisa diharapkan, setup salin-tempel dengan batas yang masuk akal, dan fitur mana yang sebaiknya dilewati. Data benchmark lengkap di balik angka-angka ini ada di [Kebutuhan Perangkat Keras](/id/guide/deployment#hardware-requirements).

Dua batasan keras di awal:

- **Hanya 64-bit.** Image dibangun untuk `linux/amd64` dan `linux/arm64`. ARM 32-bit (`armv7`/`armhf`) tidak didukung, sehingga Pi generasi pertama dan keluarga Pi Zero tidak bisa digunakan.
- **Batas bawah memori 2 GB (alat non-AI).** 512 MB tidak dapat menjalankan stack, dan 1 GB gagal pada batch multi-file. 2 GB dengan 2 core adalah konfigurasi terkecil yang menjalankan alat non-AI dengan nyaman.

## Apa yang berjalan baik di perangkat keras kecil {#what-runs-well}

Setiap alat non-AI berfungsi di mesin 2 GB / 2 core: seluruh bagian Image dan Files, alat PDF, serta operasi video dan audio stream-copy (potong, bisukan, remux container). Sebagian besar selesai dalam waktu kurang dari satu detik.

Dua beban kerja adalah pengecualian:

- **Encode ulang video** (konversi antar codec) dibatasi oleh CPU. Klip 1080p yang memakan ~40 d di CPU desktop yang cepat dapat memakan beberapa menit di CPU kelas Pi. Operasi stream-copy tetap instan.
- **Alat AI** memiliki batas bawah memori CPU per bundle: RAM host 2 GB (0,5 GB bebas) untuk Face Detection dan Fast OCR bawaan, memori efektif 4 GiB yang dikonfigurasi untuk Accurate OCR, RAM host 4 GB (2 sampai 3 GB bebas) untuk Transcription, Object Eraser & Colorize, Background Removal, Upscale & Enhance, dan Photo Restoration, serta RAM host 8 GB (6 GB bebas) untuk High-Quality Inpainting. Mesin 2 GB tidak dapat menjalankan Whisper, RealESRGAN, rembg, atau LaMa tanpa dihentikan oleh OOM, sehingga SnapOtter memeriksa memori bebas sebelum mengirim ke sidecar Python dan langsung menolak eksekusi di bawah batas bawah bundle.

Keduanya tidak terinstal atau berjalan kecuali Anda menggunakannya: tanpa bundle AI yang terinstal, aplikasi idle di sekitar 360 MB, dan bundle AI hanya diunduh ketika admin mengaktifkannya.

## Panduan Raspberry Pi / laptop lama {#walkthrough}

Ini adalah instalasi Compose standar dari [Memulai](/id/guide/getting-started), ditambah batas sumber daya dan batas yang konservatif. Panduan ini mengasumsikan OS 64-bit (di Pi: Raspberry Pi OS 64-bit atau Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@db:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@db:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-snapotter}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      - POSTGRES_DB=${POSTGRES_DB:-snapotter}
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Catatan untuk mesin kelas Pi:

- **Pilih SSD USB dibanding kartu SD** untuk volume data dan Postgres. Workspace job melakukan IO disk yang nyata, dan kartu SD lambat sekaligus cepat aus.
- **Container tunggal all-in-one juga berfungsi di sini** (Postgres dan Redis tertanam ketika [`DATABASE_URL`](/id/guide/configuration#env-database-url)/[`REDIS_URL`](/id/guide/configuration#env-redis-url) tidak diatur), dan pada host dengan memori terbatas Anda sebaiknya menurunkan batas Redis tertanamnya dengan [`REDIS_MAXMEMORY`](/id/guide/configuration#env-redis-maxmemory) (lihat [Konfigurasi](/id/guide/configuration)). Compose memberi Anda kontrol per layanan yang lebih halus, itulah sebabnya panduan ini menggunakannya.
- **Tambahkan swap pada perangkat 2 GB.** Swap mencegah lonjakan sesekali (PDF besar, batch yang lupa Anda batasi) berakhir dengan penghentian karena kehabisan memori. zram adalah opsi yang ramah kartu SD.
- Image arm64 hanya CPU; tidak ada CUDA di board ARM.

## Parameter penyetelan {#tuning-knobs}

Semua batas adalah variabel lingkungan, yang didokumentasikan lengkap di [Konfigurasi](/id/guide/configuration). `0` berarti tanpa batas atau otomatis. Yang penting di perangkat keras kecil:

| Variabel | Saran untuk mesin kecil | Yang dilindungi |
|---|---|---|
| [`CONCURRENT_JOBS`](/id/guide/configuration#env-concurrent-jobs) | `1` | Berapa banyak job yang berjalan secara paralel. Deteksi otomatis menggunakan jumlah core CPU dikurangi satu, yang cocok untuk mesin besar tetapi terlalu agresif pada mesin 2 core di bawah tekanan memori. |
| [`MAX_WORKER_THREADS`](/id/guide/configuration#env-max-worker-threads) | `2` | Thread pool pemrosesan gambar. |
| [`AI_SIDECAR_IDLE_TIMEOUT`](/id/guide/configuration#env-ai-sidecar-idle-timeout) | `120` | Berapa lama proses Python AI dan runtime OCR tetap dimuat setelah permintaan terakhir. Keduanya menahan 1-2 GB saat hangat, sehingga jendela yang lebih pendek mengembalikan memori lebih cepat dengan konsekuensi beberapa detik pada panggilan AI berikutnya. Turunkan juga [`AI_SESSION_IDLE_TIMEOUT`](/id/guide/configuration#env-ai-session-idle-timeout), karena proses yang keluar membuang model yang di-cache. |
| [`MAX_BATCH_SIZE`](/id/guide/configuration#env-max-batch-size) | `5` | Batch adalah tempat mesin 1-2 GB pertama kali kehabisan memori. |
| [`MAX_UPLOAD_SIZE_MB`](/id/guide/configuration#env-max-upload-size-mb) | `100` | Mencegah satu file raksasa menempati seluruh workspace. |
| [`MAX_MEGAPIXELS`](/id/guide/configuration#env-max-megapixels) | `50` | Men-decode gambar 100+ MP memakan RAM terlepas dari ukuran file. Gambar di atas sekitar 268 MP ditolak bahkan pada `0`. |
| [`MAX_VIDEO_DURATION_S`](/id/guide/configuration#env-max-video-duration-s) | `300` | Transcode yang panjang memonopoli CPU kecil selama menit hingga jam. |
| [`JOB_TIMEOUT_LONG_S`](/id/guide/configuration#env-job-timeout-long-s) | `3600` | Batas keras untuk job AI dan media, agar job yang lepas kendali pada akhirnya membebaskan mesin. Defaultnya dua jam. Job gambar dan dokumen sudah berhenti pada [`JOB_TIMEOUT_FAST_S`](/id/guide/configuration#env-job-timeout-fast-s) (120 detik secara default). |

Batas-batas ini berlaku untuk apa yang diterima server, jadi atur agar sesuai dengan yang benar-benar Anda gunakan, bukan sekecil mungkin. Jika Anda tidak pernah menyentuh video, batas `MAX_VIDEO_DURATION_S` tidak merugikan apa pun; jika Anda memindai dokumen setiap hari, jangan batasi [`MAX_PDF_PAGES`](/id/guide/configuration#env-max-pdf-pages).

## Yang sebaiknya dilewati {#what-to-skip}

- **Bundle AI yang berat.** Upscaling, pemulihan foto, dan penghapusan latar belakang membutuhkan GPU atau CPU many-core yang cepat, dan setiap bundle memakan 4-5 GB disk. Pada mesin kecil, cukup jangan instal; alat yang bundle-nya belum ada menampilkan prompt instalasi alih-alih berjalan.
- **Encode ulang video sebagai beban kerja rutin.** Transcode sesekali tidak masalah (hanya lambat); antrean transcode yang terus-menerus membutuhkan core CPU, bukan Pi.
- **Alat yang tidak digunakan secara umum.** Admin dapat mematikan alat tertentu di Settings, yang menghapusnya dari UI dan menghentikan pendaftaran route API-nya. Ini tidak menghemat memori dengan sendirinya, tetapi mencegah instance kecil bersama digunakan untuk satu beban kerja yang tidak sanggup ditangani perangkat keras.

Jika nanti Anda memindahkan instance ke perangkat keras yang lebih besar, hapus batas-batasnya (kembalikan ke `0`) dan volume data yang sama akan terbawa.
