---
i18n_source_hash: 959cca5c298c
i18n_provenance: machine
i18n_output_hash: 01457d7cc933
i18n_hash_version: 2
---
# Upgrade dari 1.x ke 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x menyimpan semuanya dalam satu file SQLite dan berjalan sebagai satu container. SnapOtter 2.0 menggunakan PostgreSQL dan Redis. Panduan ini menjelaskan cara memindahkan instalasi 1.x ke 2.0 tanpa kehilangan data.

Versi singkatnya: gunakan kembali volume `/data` Anda yang ada, dan 2.0 mengimpor database 1.x Anda secara otomatis pada boot pertama. Pengguna, file tersimpan, pengaturan, API key, dan pipeline Anda ikut terbawa. Database lama tidak pernah dimodifikasi, sehingga Anda selalu dapat melakukan rollback.

::: tip Catatan untuk pengguna 1.x kami
Banyak dari Anda telah memercayai SnapOtter sejak hari pertama, dan umpan balik Anda membentuk rilis ini. 2.0 mengubah banyak hal di balik layar, dan panduan ini ada agar perpindahan tidak merugikan apa pun yang Anda pedulikan. Akun, file, pengaturan, API key, dan pipeline Anda ikut terbawa, dan database lama Anda tidak pernah disentuh. Terima kasih telah melakukan upgrade bersama kami.
:::

## Sebelum Anda mulai: backup seluruh volume `/data` {#before-you-start-back-up-the-whole-data-volume}

Lakukan ini terlebih dahulu, setiap saat. Backup **seluruh** volume `/data`, bukan hanya file `snapotter.db`.

Inilah mengapa hal ini penting. 1.x menjalankan SQLite dalam mode WAL, sehingga container 1.x yang dihentikan biasanya meninggalkan sebagian besar data yang sudah di-commit di `snapotter.db-wal` di samping `snapotter.db` yang hampir kosong. Menyalin hanya `snapotter.db` menangkap database kosong dan diam-diam kehilangan semuanya. Volume membawa `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm`, dan direktori `files/` Anda bersama-sama, dan semuanya harus dipindahkan sebagai satu set.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Upgrade ke 1.17.2 terlebih dahulu {#upgrade-to-1-17-2-first}

Upgrade instalasi 1.x Anda ke rilis 1.x terbaru (1.17.2) sebelum pindah ke 2.0. Dengan begitu 1.x menjalankan migrasi skema finalnya sendiri, sehingga 2.0 mengimpor dari skema yang dikenal dan lengkap. Upgrade dari 1.x yang lebih lama langsung ke 2.0 tidak didukung.

## Periksa nama volume Anda {#check-your-volume-name}

Importer hanya melihat data Anda jika stack 2.0 me-mount volume yang sama dengan yang digunakan instalasi 1.x Anda. Nama volume Docker peka huruf besar/kecil, dan cuplikan README yang lebih lama menggunakan `snapotter-data` huruf kecil sedangkan file Compose menggunakan `SnapOtter-data`. Pastikan mana yang Anda miliki:

```bash
docker volume ls | grep -i snapotter
```

Gunakan nama persis itu dalam konfigurasi 2.0 Anda.

## Jalur A: container tunggal (tercepat) {#path-a-single-container-quickest}

Jika Anda menjalankan SnapOtter dengan satu `docker run`, teruskan cara itu. 2.0 mem-boot PostgreSQL dan Redis tertanam di dalam container ketika Anda tidak mengatur `DATABASE_URL` atau `REDIS_URL`, dan otomatis mendeteksi serta mengimpor `/data/snapotter.db` pada boot pertama.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Perhatikan log untuk baris seperti:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

Selesai. Login dengan kredensial Anda yang ada.

## Jalur B: Compose (direkomendasikan untuk produksi) {#path-b-compose-recommended-for-production}

Stack Compose 2.0 menjalankan tiga layanan (app, Postgres, Redis). Gunakan kembali volume `/data` 1.x Anda untuk layanan app. Aplikasi otomatis mendeteksi `/data/snapotter.db` dan mengimpornya ke Postgres pada boot pertama.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Jika Anda lebih suka mengarahkan ke database lama secara eksplisit, atur `SQLITE_MIGRATE_PATH=/data/snapotter.db`. Path eksplisit selalu menang atas deteksi otomatis.

## Pratinjau impor terlebih dahulu (opsional) {#preview-the-import-first-optional}

Untuk melihat persis apa yang akan diimpor tanpa menulis apa pun, jalankan dry run terhadap file database Anda:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Perintah ini mencetak jumlah baris per tabel, berapa banyak file pustaka tersimpan yang ditemukan di disk, dan status job apa pun yang akan dinormalisasi. Tidak memerlukan Postgres yang berjalan.

## Apa yang terbawa, dan apa yang tidak {#what-carries-over-and-what-does-not}

Terbawa:

- Pengguna, dan kemampuan untuk login. Hash password tidak berubah, sehingga username dan password yang sama berfungsi.
- Tim, pengaturan (termasuk identitas instance Anda), role, API key (tetap berfungsi), dan pipeline tersimpan.
- Record riwayat job.
- Pustaka file tersimpan Anda, baik record maupun file aslinya, karena `/data/files` dipertahankan di volume.

Tidak terbawa:

- Sesi login. Semua orang masuk sekali setelah upgrade. Kredensial tidak berubah, jadi hanya satu kali login ulang, tidak lebih.
- File input dan output dari job pemrosesan lama. File-file itu berada di workspace sementara dan hilang secara by design. Record riwayat job tetap ada.
- Flag persetujuan analitik per pengguna dari 1.x, yang tidak memiliki padanan di 2.0 (analitik 2.0 adalah pengaturan tingkat instance).

## Mematikan impor {#turning-the-import-off}

Jika Anda sengaja menginginkan database baru meskipun `snapotter.db` ada di volume, atur `SQLITE_MIGRATE_PATH=off`.

## Jika Anda sudah memiliki data di instance 2.0 {#if-you-already-have-data-in-the-2-0-instance}

Importer hanya berjalan ke database kosong. Jika Anda memulai 2.0 dari awal (membuat data), lalu belakangan me-mount `snapotter.db` lama, 2.0 akan mendeteksinya tetapi tidak mengimpor, karena menggabungkan dua dataset dapat menyebabkan tabrakan ID. Anda akan melihat peringatan di log. Untuk mengimpor data 1.x, Anda memerlukan instance kosong:

- Jika instance 2.0 hanya berisi admin default (Anda belum benar-benar menggunakannya), hentikan stack, hapus volume Postgres (`SnapOtter-pgdata`), dan boot lagi dengan `/data` lama tersedia. Impor akan berjalan bersih. Ini hanya menghapus data Postgres sementara, bukan database 1.x Anda.
- Jika instance 2.0 berisi data nyata yang ingin Anda pertahankan, kedua dataset tidak dapat digabung otomatis. Ekspor apa yang Anda perlukan dan impor data 1.x ke deployment baru yang terpisah.

## Melakukan rollback {#rolling-back}

Upgrade tidak pernah memodifikasi atau menghapus `snapotter.db` 1.x Anda. Jika Anda perlu kembali ke 1.x, deploy ulang image 1.x pada volume yang sama. Apa pun yang Anda buat di 2.0 setelah upgrade berada di Postgres dan tidak akan ada di database 1.x, jadi lakukan rollback segera jika Anda akan melakukannya.
