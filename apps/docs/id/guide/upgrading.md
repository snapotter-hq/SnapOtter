---
i18n_source_hash: 9a6abf3fc8ae
i18n_provenance: human
i18n_output_hash: c8e22583e597
---
# Meningkatkan dari 1.x ke 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x menyimpan semuanya dalam satu file SQLite dan berjalan sebagai satu kontainer. SnapOtter 2.0 menggunakan PostgreSQL dan Redis. Panduan ini memandu pemindahan instalasi 1.x ke 2.0 tanpa kehilangan data.

Versi singkatnya: gunakan kembali volume `/data` yang sudah ada, dan 2.0 mengimpor database 1.x Anda secara otomatis pada boot pertama. Pengguna, file tersimpan, pengaturan, kunci API, dan pipeline Anda ikut terbawa. Database lama tidak pernah diubah, jadi Anda selalu dapat melakukan rollback.

::: tip Catatan untuk pengguna 1.x kami
Banyak dari Anda telah memercayai SnapOtter sejak hari pertama, dan masukan Anda membentuk rilis ini. 2.0 banyak berubah di balik layar, dan panduan ini ada agar perpindahan tidak merugikan hal-hal yang Anda pedulikan. Akun, file, pengaturan, kunci API, dan pipeline Anda ikut terbawa, dan database lama Anda tidak pernah tersentuh. Terima kasih telah meningkatkan bersama kami.
:::

## Sebelum mulai: cadangkan seluruh volume `/data` {#before-you-start-back-up-the-whole-data-volume}

Lakukan ini terlebih dahulu, setiap kali. Cadangkan **seluruh** volume `/data`, bukan hanya file `snapotter.db`.

Beginilah alasannya penting. 1.x menjalankan SQLite dalam mode WAL, sehingga kontainer 1.x yang dihentikan secara rutin meninggalkan sebagian besar data commit-nya di `snapotter.db-wal` di samping `snapotter.db` yang hampir kosong. Menyalin hanya `snapotter.db` akan menangkap database kosong dan diam-diam menghilangkan semuanya. Volume tersebut membawa `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm`, dan direktori `files/` Anda bersama-sama, dan semuanya harus berpindah sebagai satu set.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Tingkatkan ke 1.17.2 terlebih dahulu {#upgrade-to-1-17-2-first}

Tingkatkan instalasi 1.x Anda ke rilis 1.x terbaru (1.17.2) sebelum berpindah ke 2.0. Itu memungkinkan 1.x menjalankan migrasi skema finalnya sendiri, sehingga 2.0 mengimpor dari skema yang diketahui dan lengkap. Meningkatkan dari 1.x yang lebih lama langsung ke 2.0 tidak didukung.

## Periksa nama volume Anda {#check-your-volume-name}

Importer hanya melihat data Anda jika stack 2.0 memasang volume yang sama dengan yang digunakan instalasi 1.x Anda. Nama volume Docker sensitif huruf besar-kecil, dan cuplikan README yang lebih lama menggunakan `snapotter-data` huruf kecil sementara file Compose menggunakan `SnapOtter-data`. Pastikan mana yang Anda miliki:

```bash
docker volume ls | grep -i snapotter
```

Gunakan nama persis itu dalam konfigurasi 2.0 Anda.

## Jalur A: kontainer tunggal (tercepat) {#path-a-single-container-quickest}

Jika Anda menjalankan SnapOtter dengan satu `docker run`, teruskan melakukannya. 2.0 mem-boot PostgreSQL dan Redis tertanam di dalam kontainer saat Anda tidak menyetel `DATABASE_URL` atau `REDIS_URL`, dan secara otomatis mendeteksi serta mengimpor `/data/snapotter.db` pada boot pertama.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Pantau log untuk baris seperti:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

Selesai. Masuk dengan kredensial yang sudah ada.

## Jalur B: Compose (disarankan untuk produksi) {#path-b-compose-recommended-for-production}

Stack Compose 2.0 menjalankan tiga layanan (app, Postgres, Redis). Gunakan kembali volume `/data` 1.x Anda untuk layanan app. Aplikasi secara otomatis mendeteksi `/data/snapotter.db` dan mengimpornya ke Postgres pada boot pertama.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Jika Anda lebih suka menunjuk ke database lama secara eksplisit, setel `SQLITE_MIGRATE_PATH=/data/snapotter.db`. Jalur eksplisit selalu menang atas deteksi otomatis.

## Pratinjau impor terlebih dahulu (opsional) {#preview-the-import-first-optional}

Untuk melihat persis apa yang akan diimpor tanpa menulis apa pun, jalankan dry run terhadap file database Anda:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Ini mencetak jumlah baris per tabel, berapa banyak file pustaka tersimpan yang ditemukan di disk, dan status pekerjaan apa pun yang akan dinormalisasi. Tidak memerlukan Postgres yang berjalan.

## Apa yang ikut terbawa, dan apa yang tidak {#what-carries-over-and-what-does-not}

Yang ikut terbawa:

- Pengguna, dan kemampuan untuk masuk. Hash kata sandi tidak berubah, jadi username dan kata sandi yang sama tetap berfungsi.
- Tim, pengaturan (termasuk identitas instans Anda), peran, kunci API (tetap berfungsi), dan pipeline tersimpan.
- Catatan riwayat pekerjaan.
- Pustaka file tersimpan Anda, baik catatannya maupun file sebenarnya, karena `/data/files` dipertahankan pada volume.

Yang tidak ikut terbawa:

- Sesi login. Semua orang masuk sekali setelah peningkatan. Kredensial tidak berubah, jadi ini hanya satu kali login ulang, tidak lebih.
- File input dan output dari pekerjaan pemrosesan lama. File-file itu berada di ruang kerja sementara dan hilang secara desain. Catatan riwayat pekerjaan tetap ada.
- Flag persetujuan analitik per pengguna dari 1.x, yang tidak memiliki padanan di 2.0 (analitik 2.0 adalah pengaturan tingkat instans).

## Menonaktifkan impor {#turning-the-import-off}

Jika Anda sengaja menginginkan database baru meskipun ada `snapotter.db` pada volume, setel `SQLITE_MIGRATE_PATH=off`.

## Jika Anda sudah memiliki data di instans 2.0 {#if-you-already-have-data-in-the-2-0-instance}

Importer hanya berjalan pada database kosong. Jika Anda memulai 2.0 dari awal (membuat data), lalu kemudian memasang `snapotter.db` lama, 2.0 akan mendeteksinya tetapi tidak akan mengimpor, karena menggabungkan dua kumpulan data dapat menyebabkan tabrakan pada ID. Anda akan melihat peringatan di log. Untuk mengimpor data 1.x, Anda memerlukan instans kosong:

- Jika instans 2.0 hanya berisi admin bawaan (Anda belum benar-benar menggunakannya), hentikan stack, hapus volume Postgres (`SnapOtter-pgdata`), dan boot lagi dengan `/data` lama tersedia. Ini akan mengimpor dengan bersih. Ini hanya menghapus data Postgres sekali pakai, bukan database 1.x Anda.
- Jika instans 2.0 berisi data nyata yang ingin Anda pertahankan, kedua kumpulan data tidak dapat digabungkan otomatis. Ekspor apa yang Anda butuhkan dan impor data 1.x ke deployment baru yang terpisah.

## Melakukan rollback {#rolling-back}

Peningkatan tidak pernah mengubah atau menghapus `snapotter.db` 1.x Anda. Jika Anda perlu kembali ke 1.x, deploy ulang image 1.x terhadap volume yang sama. Apa pun yang Anda buat di 2.0 setelah peningkatan berada di Postgres dan tidak akan ada di database 1.x, jadi lakukan rollback segera jika memang akan melakukannya.
