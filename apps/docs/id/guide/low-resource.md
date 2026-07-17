---
i18n_source_hash: f5de74aee1b9
i18n_provenance: machine
i18n_output_hash: 9d7672d6f808
---
# Penyiapan Sumber Daya Rendah {#low-resource-setups}

SnapOtter berjalan baik di perangkat keras kecil: Raspberry Pi 4 atau 5, laptop lama, atau VPS 2 GB. Halaman ini adalah panduan praktis untuk mesin-mesin tersebut: apa yang bisa diharapkan, penyiapan salin-tempel dengan batas yang masuk akal, dan fitur mana yang sebaiknya dilewati. Data benchmark lengkap di balik angka-angka ini ada di [Persyaratan Perangkat Keras](/id/guide/deployment#hardware-requirements).

Dua batasan mutlak di awal:

- **Hanya 64-bit.** Image dibangun untuk `linux/amd64` dan `linux/arm64`. ARM 32-bit (`armv7`/`armhf`) tidak didukung, sehingga Pi generasi pertama dan keluarga Pi Zero tidak bisa dipakai.
- **Batas bawah memori 2 GB.** 512 MB tidak dapat memulai stack, dan 1 GB gagal pada batch multi-file. 2 GB dengan 2 core adalah konfigurasi terkecil yang bekerja dengan nyaman.

## Apa yang berjalan baik di perangkat keras kecil {#what-runs-well}

Setiap perkakas non-AI bekerja pada mesin 2 GB / 2 core: seluruh bagian Gambar dan File, perkakas PDF, serta operasi video dan audio stream-copy (trim, mute, remux kontainer). Sebagian besar selesai dalam waktu kurang dari satu detik.

Dua beban kerja menjadi pengecualian:

- **Re-encoding video** (konversi antar codec) terikat pada CPU. Klip 1080p yang memakan waktu ~40 detik pada CPU desktop yang cepat bisa memakan beberapa menit pada CPU kelas Pi. Operasi stream-copy tetap instan.
- **Perkakas AI** membutuhkan RAM (4 GB direkomendasikan) dan disk (bundel yang lebih besar masing-masing 4-5 GB), dan yang berat (peningkatan skala, pemulihan foto, penghapusan latar belakang) tidak praktis pada CPU kelas Pi. AI ringan seperti deteksi wajah dan OCR dapat digunakan jika Anda memiliki memori untuk itu.

Keduanya tidak terpasang atau berjalan kecuali Anda menggunakannya: tanpa bundel AI terpasang, aplikasi idle di sekitar 360 MB, dan bundel AI hanya diunduh ketika admin mengaktifkannya.

## Panduan Raspberry Pi / laptop lama {#walkthrough}

Ini adalah instalasi Compose standar dari [Memulai](/id/guide/getting-started), ditambah batas sumber daya dan batas atas yang konservatif. Panduan ini mengasumsikan OS 64-bit (pada Pi: Raspberry Pi OS 64-bit atau Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@db:5432/snapotter
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
      - POSTGRES_USER=snapotter
      - POSTGRES_PASSWORD=snapotter
      - POSTGRES_DB=snapotter
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Catatan untuk mesin kelas Pi:

- **Utamakan SSD USB daripada kartu SD** untuk volume data dan Postgres. Ruang kerja job melakukan IO disk yang nyata, dan kartu SD lambat sekaligus cepat aus.
- **Kontainer tunggal all-in-one juga bisa dipakai di sini** (Postgres dan Redis embedded ketika `DATABASE_URL`/`REDIS_URL` tidak diatur), dan pada host dengan memori terbatas Anda sebaiknya menurunkan batas Redis embedded-nya dengan `REDIS_MAXMEMORY` (lihat [Konfigurasi](/id/guide/configuration)). Compose memberi Anda kontrol per layanan yang lebih halus, itulah sebabnya panduan ini menggunakannya.
- **Tambahkan swap pada perangkat 2 GB.** Ini mencegah lonjakan sesekali (PDF besar, batch yang lupa Anda batasi) berakhir dengan out-of-memory kill. zram adalah pilihan yang ramah kartu SD.
- Image arm64 hanya mendukung CPU; tidak ada CUDA di board ARM.

## Opsi penyetelan {#tuning-knobs}

Semua batas adalah variabel lingkungan, didokumentasikan lengkap di [Konfigurasi](/id/guide/configuration). `0` berarti tak terbatas atau otomatis. Yang penting pada perangkat keras kecil:

| Variabel | Saran untuk mesin kecil | Apa yang dilindunginya |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Berapa banyak job yang berjalan paralel. Deteksi otomatis menggunakan jumlah core CPU dikurangi satu, yang tidak masalah di mesin besar tetapi terlalu agresif di mesin 2 core yang memorinya tertekan. |
| `MAX_WORKER_THREADS` | `2` | Thread pool pemrosesan gambar. |
| `MAX_BATCH_SIZE` | `5` | Batch adalah tempat mesin 1-2 GB pertama kali kehabisan memori. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Mencegah satu file raksasa menghabiskan seluruh ruang kerja. |
| `MAX_MEGAPIXELS` | `50` | Mendekode gambar 100+ MP memakan RAM berapa pun ukuran filenya. |
| `MAX_VIDEO_DURATION_S` | `300` | Transcode panjang memonopoli CPU kecil selama hitungan menit hingga jam. |
| `PROCESSING_TIMEOUT_S` | `600` | Plafon keras agar job yang lepas kendali akhirnya membebaskan mesin. |

Batas-batas ini berlaku pada apa yang diterima server, jadi aturlah agar sesuai dengan apa yang benar-benar Anda gunakan, bukan sekecil mungkin. Jika Anda tidak pernah menyentuh video, batas `MAX_VIDEO_DURATION_S` tidak merugikan apa pun; jika Anda memindai dokumen setiap hari, jangan batasi `MAX_PDF_PAGES`.

## Apa yang sebaiknya dilewati {#what-to-skip}

- **Bundel AI berat.** Peningkatan skala, pemulihan foto, dan penghapusan latar belakang membutuhkan GPU atau CPU banyak-core yang cepat, dan setiap bundel memakan 4-5 GB disk. Di mesin kecil, cukup jangan pasang bundel tersebut; perkakas yang bundelnya tidak ada akan menampilkan prompt pemasangan alih-alih berjalan.
- **Re-encoding video sebagai beban kerja rutin.** Transcode sesekali tidak masalah (hanya lambat); antrean transcode yang terus-menerus membutuhkan core CPU, bukan Pi.
- **Perkakas yang tidak terpakai secara umum.** Admin dapat mematikan perkakas satu per satu di Settings, yang menghapusnya dari UI dan menghentikan pendaftaran rute API-nya. Itu sendiri tidak menghemat memori, tetapi mencegah instance kecil yang dipakai bersama digunakan untuk satu-satunya beban kerja yang tidak sanggup ditangani perangkat kerasnya.

Jika nanti Anda memindahkan instance ke perangkat keras yang lebih besar, hapus batas-batasnya (kembalikan ke `0`) dan volume data yang sama ikut terbawa.
