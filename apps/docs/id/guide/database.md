---
description: "Skema database PostgreSQL, tabel, migrasi, dan prosedur pencadangan untuk SnapOtter."
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: e23431b3174a
i18n_hash_version: 2
---

# Database {#database}

SnapOtter menggunakan PostgreSQL 17 dengan [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) untuk persistensi data. Skema didefinisikan di `apps/api/src/db/schema.ts`.

Koneksi dikonfigurasi melalui variabel lingkungan `DATABASE_URL` (default `postgres://snapotter:snapotter@postgres:5432/snapotter`). Di Docker Compose, kontainer Postgres menyimpan datanya di volume bernama `SnapOtter-pgdata`. Permintaan dilayani menggunakan peran yang hanya dapat membaca dan menulis baris, yang dibahas di [Peran hak akses minimal](#least-privilege-roles) di bawah.

## Tabel {#tables}

### users {#users}

Menyimpan akun pengguna. Dibuat otomatis pada saat pertama kali dijalankan dari `DEFAULT_USERNAME` dan `DEFAULT_PASSWORD`.

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid | Primary key |
| `username` | varchar | Unik, wajib |
| `passwordHash` | varchar | hash scrypt |
| `role` | varchar | `admin`, `editor`, atau `user` |
| `mustChangePassword` | boolean | Flag reset kata sandi paksa |
| `createdAt` | timestamp | Waktu pembuatan |
| `updatedAt` | timestamp | Waktu pembaruan terakhir |

### sessions {#sessions}

Sesi login aktif. Setiap baris mengaitkan token sesi ke seorang pengguna.

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | varchar | Primary key (token sesi) |
| `userId` | uuid | Foreign key ke `users.id` |
| `expiresAt` | timestamp | Waktu kedaluwarsa |
| `createdAt` | timestamp | Waktu pembuatan |

### teams {#teams}

Grup untuk mengorganisasi pengguna. Admin dapat menetapkan pengguna ke tim.

| Kolom | Tipe | Deskripsi |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | varchar (unik, maks 50 karakter) | Nama tim |
| `createdAt` | timestamp | Waktu pembuatan |

### api_keys {#api-keys}

API key untuk akses secara programatik. Kunci mentah ditampilkan sekali saat pembuatan; hanya hash yang disimpan.

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid | Primary key |
| `userId` | uuid | Foreign key ke `users.id` |
| `keyHash` | varchar | hash scrypt dari kunci |
| `name` | varchar | Label yang diberikan pengguna |
| `createdAt` | timestamp | Waktu pembuatan |
| `lastUsedAt` | timestamp | Diperbarui pada setiap permintaan terautentikasi |

Kunci diberi awalan `si_` diikuti oleh 96 karakter heksadesimal (48 byte acak).

### pipelines {#pipelines}

Rangkaian tool tersimpan yang dibuat pengguna di UI.

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | varchar | Nama pipeline |
| `description` | varchar | Deskripsi opsional |
| `steps` | jsonb | Array objek `{ toolId, settings }` |
| `createdAt` | timestamp | Waktu pembuatan |

### user_files {#user-files}

Pustaka file persisten. Secara default, sebuah editan yang disimpan dimasukkan sebagai baris akar independen ("simpan sebagai baru": `version` 1, `parentId` null, sehingga file asli tetap terdaftar), atau sebagai versi yang tertaut ke induk ketika Anda menimpa file asli (`parentId` diisi, `version` dinaikkan, menggantikannya). Kolom `toolChain` mencatat tool yang diterapkan.

| Kolom | Tipe | Deskripsi |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `userId` | uuid | FK ke users (CASCADE DELETE) |
| `originalName` | varchar | Nama file unggahan asli |
| `storedName` | varchar | Nama file pada disk |
| `mimeType` | varchar | Tipe MIME |
| `size` | integer | Ukuran file dalam byte |
| `width` | integer | Lebar gambar dalam px |
| `height` | integer | Tinggi gambar dalam px |
| `version` | integer | Nomor versi (1 = asli) |
| `parentId` | uuid atau null | FK ke user_files (versi induk) |
| `toolChain` | jsonb | ID tool yang diterapkan secara berurutan untuk menghasilkan versi ini |
| `createdAt` | timestamp | Waktu pembuatan |

### jobs {#jobs}

Melacak job pemrosesan untuk pelaporan progres dan pembersihan.

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid | Primary key |
| `type` | varchar | Identifikasi tool atau pipeline |
| `status` | varchar | `queued`, `processing`, `completed`, atau `failed` |
| `progress` | real | Fraksi 0.0-1.0 |
| `inputFiles` | jsonb | Array path file input |
| `outputPath` | varchar | Path ke file hasil |
| `settings` | jsonb | Pengaturan tool yang digunakan |
| `error` | varchar | Pesan kesalahan jika gagal |
| `createdAt` | timestamp | Waktu pembuatan |
| `completedAt` | timestamp | Waktu penyelesaian |

### settings {#settings}

Penyimpanan key-value untuk pengaturan seluruh server yang dapat diubah admin dari UI.

| Kolom | Tipe | Catatan |
|---|---|---|
| `key` | varchar | Primary key |
| `value` | varchar | Nilai pengaturan |
| `updatedAt` | timestamp | Waktu pembaruan terakhir |

### roles {#roles}

Peran kustom dengan izin granular.

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | varchar | Nama peran unik |
| `description` | varchar | Deskripsi opsional |
| `permissions` | jsonb | Array string izin |
| `createdAt` | timestamp | Waktu pembuatan |

### audit_log {#audit-log}

Log aksi yang relevan dengan keamanan.

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid | Primary key |
| `userId` | uuid | FK ke users |
| `action` | varchar | Tipe aksi |
| `details` | jsonb | Data khusus aksi |
| `createdAt` | timestamp | Waktu aksi |

### user_preferences {#user-preferences}

Status UI per pengguna, dikunci berdasarkan nama preferensi. Menyimpan alat yang disematkan di halaman beranda, yang ditulis melalui `PUT /api/v1/preferences`.

| Kolom | Tipe | Catatan |
|---|---|---|
| `userId` | text | FK ke users, menghapus secara berantai. Primary key bersama `key` |
| `key` | text | Nama preferensi. Primary key bersama `userId` |
| `value` | jsonb | Muatan preferensi |
| `updatedAt` | timestamp | Penulisan terakhir |

## Migrasi {#migrations}

Drizzle menangani migrasi skema. File migrasi berada di `apps/api/drizzle/`. Selama pengembangan:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Di produksi, migrasi yang tertunda diterapkan secara otomatis saat startup.

## Peran hak akses minimal {#least-privilege-roles}

Dua peran, dua tugas. `DATABASE_URL` melayani permintaan dan memegang `SELECT`, `INSERT`, `UPDATE`, `DELETE` pada tabel aplikasi ditambah `USAGE` dan `SELECT` pada sequence-nya. Hanya itu daftarnya. Peran ini tidak dapat membuat atau menghapus tabel, memasang ekstensi, menjalankan `TRUNCATE`, membaca `pg_authid`, membuat database, mengubah peran, atau menyentuh skema `drizzle` tempat riwayat migrasi disimpan.

`DATABASE_MIGRATION_URL` adalah peran yang berhak istimewa. Peran ini menjalankan migrasi dan memberikan hak kepada peran runtime saat boot, lalu menutup koneksinya sebelum satu permintaan pun dilayani.

Compose dan image all-in-one sudah dirangkai seperti ini, termasuk instalasi yang sudah ada. Saat boot, SnapOtter membuat peran runtime jika belum ada, memberikan haknya, menjalankan migrasi, lalu menyapukan hak tersebut ke tabel yang sudah ada sebelumnya. Pemutakhiran tidak memerlukan SQL manual.

Membiarkan `DATABASE_MIGRATION_URL` kosong akan berjalan dalam mode peran tunggal, dengan `DATABASE_URL` mengerjakan kedua tugas persis seperti sebelum pemisahan. Ini adalah konfigurasi yang didukung, bukan konfigurasi yang usang. Ini juga jawaban yang tepat pada Postgres terkelola, tempat pembuatan peran sering kali bukan wewenang Anda.

### Postgres eksternal dan terkelola {#external-and-managed-postgres}

Pada RDS, Supabase, Cloud SQL, atau cluster mana pun yang Anda jalankan sendiri, pemisahan ini bersifat opsional. Buat peran runtime sekali saja:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Lalu berikan kedua string koneksi kepada SnapOtter, yang mengarah ke host, port, dan database yang sama:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Cukup sampai di situ. SnapOtter menerapkan hak akses itu sendiri dan menerapkannya ulang setelah setiap migrasi, sehingga tabel yang ditambahkan oleh rilis mendatang ikut tercakup tanpa ada yang perlu menjalankan SQL untuknya.

Peran di `DATABASE_MIGRATION_URL` harus memiliki tabel SnapOtter, karena hanya pemilik tabel yang dapat memberikan hak atasnya. Pada instalasi yang sudah ada, itu berarti peran yang selama ini Anda pakai untuk menjalankan SnapOtter, bukan peran baru yang dibuat khusus untuk keperluan ini. Arahkan ke peran baru yang tidak memiliki apa pun dan boot akan gagal dengan pesan kesalahan yang menyatakan persis hal ini. Peran itu juga membutuhkan `CREATEROLE` untuk membuat dan memelihara peran runtime, serta hak untuk membuat skema `drizzle`.

Sebutkan peran yang sama di kedua URL dan pemisahan pun nonaktif, dan SnapOtter menyatakannya di log alih-alih berpura-pura sebaliknya. Jika penyedia Anda tidak memberi peran yang sekaligus dapat memiliki tabel dan memegang `CREATEROLE`, jalankan mode peran tunggal.

### Mengapa bit superuser dibiarkan apa adanya {#why-the-superuser-bit-is-left-alone}

SnapOtter tidak pernah mencabut `SUPERUSER` dari sebuah peran atas inisiatifnya sendiri. Pada instalasi yang dibuat sebelum pemisahan, `snapotter` adalah satu-satunya superuser di cluster, dan menurunkan haknya akan membuat cluster tidak punya superuser sama sekali, yang hanya bisa dipulihkan lewat mode pengguna tunggal dengan server dalam keadaan berhenti. Memindahkan koneksi berumur panjang ke peran yang dibatasi itulah yang memberi perlindungan. Superuser berada di jalur koneksi hanya selama beberapa detik saat boot, lalu hilang.

Instalasi all-in-one yang baru tidak pernah mengalami masalah itu. Instalasi tersebut mendapat tiga peran: `postgres` (superuser bootstrap, tidak muncul di satu pun string koneksi yang dipakai SnapOtter), `snapotter` (`NOSUPERUSER`, memiliki data, hanya terhubung saat boot), dan `snapotter_app` (hanya baris, melayani permintaan).

Untuk tetap menurunkan hak `snapotter` lama, buat superuser kedua terlebih dahulu dan masuk dengan peran itu untuk memastikan berfungsi. Setelah itu, `ALTER ROLE snapotter NOSUPERUSER`.

## Cadangkan dan pulihkan {#backup-and-restore}

Basis data relasional berada di volume `SnapOtter-pgdata` container Postgres, bukan volume `/data` aplikasi.

**Cadangan logis dengan validasi (disarankan)**

```bash
# Dump into PostgreSQL's portable custom archive format
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore into a fresh/disposable target first and fail on the first SQL error
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Kedua perintah tersebut terhubung sebagai `snapotter`, sang pemilik, dan sebaiknya tetap begitu. Peran runtime tidak dapat melihat skema `drizzle`, sehingga dump yang diambil dengan peran itu akan keluar dalam keadaan tidak lengkap. `--no-owner` membuat objek hasil pemulihan dimiliki oleh siapa pun yang menjalankan pemulihan, jadi menjalankannya sebagai pemilik menempatkan kepemilikan sesuai yang diharapkan oleh hak akses tersebut. Satu hal yang perlu diperhatikan pada cluster baru: `pg_dump` membawa hak aksesnya, tetapi tidak membawa peran yang disebutkannya, jadi buat `snapotter_app` sebelum memulihkan atau `--exit-on-error` akan berhenti pada `GRANT` pertama. Bagaimanapun juga, SnapOtter menerapkan ulang hak akses itu pada boot berikutnya.

Dump database ini tidak berisi objek perpustakaan yang disimpan di `/data/files` atau status BullMQ yang tahan lama di Redis. Cadangkan dan pulihkan dengan prosedur terkoordinasi di [Keamanan & Pengerasan](/id/guide/security#backup-and-recovery).

**Snapshot volume dingin**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Jangan menyalin direktori data PostgreSQL langsung dengan `tar`. Tulis nama volume awalan berdasarkan proyek, jadi selesaikan ID volume yang terpasang dari `docker inspect` atau platform penyimpanan Anda daripada menggunakan label literal `SnapOtter-pgdata`.

### Migrasi dari 1.x (SQLite) {#migrating-from-1-x-sqlite}

Memutakhirkan dari SnapOtter 1.x memiliki panduannya sendiri: lihat [Memutakhirkan dari 1.x ke 2.0](./upgrading). Singkatnya, gunakan kembali volume `/data` Anda yang ada dan 2.0 otomatis mendeteksi serta mengimpor `/data/snapotter.db` pada boot pertama (atau atur `SQLITE_MIGRATE_PATH` untuk menunjuk ke sana secara eksplisit). Cadangkan seluruh volume `/data` terlebih dahulu, bukan hanya `snapotter.db`: 1.x menggunakan mode SQLite WAL, sehingga kontainer yang dihentikan sering meninggalkan sebagian besar datanya di `snapotter.db-wal` di samping `snapotter.db` yang hampir kosong.
