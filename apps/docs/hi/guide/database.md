---
description: "Skema database PostgreSQL, tabel, migrasi, dan prosedur backup untuk SnapOtter."
i18n_source_hash: 2150213f21da
i18n_provenance: machine
i18n_output_hash: 8170871e0a5b
i18n_hash_version: 2
---

# Database {#database}

SnapOtter memakai PostgreSQL 17 dengan [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) untuk persistensi data. Skemanya didefinisikan di `apps/api/src/db/schema.ts`.

Koneksi dikonfigurasi lewat environment variable `DATABASE_URL` (default `postgres://snapotter:snapotter@postgres:5432/snapotter`). Di Docker Compose, container Postgres menyimpan datanya di named volume `SnapOtter-pgdata`. Permintaan dilayani dengan role yang hanya dapat membaca dan menulis baris, yang dibahas di bawah [Least-privilege roles](#least-privilege-roles).

## Tables {#tables}

### users {#users}

Menyimpan akun pengguna. Dibuat otomatis pada proses pertama dari `DEFAULT_USERNAME` dan `DEFAULT_PASSWORD`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `username` | varchar | Unik, wajib |
| `passwordHash` | varchar | Hash scrypt |
| `role` | varchar | `admin`, `editor`, atau `user` |
| `mustChangePassword` | boolean | Flag reset password paksa |
| `createdAt` | timestamp | Waktu pembuatan |
| `updatedAt` | timestamp | Waktu pembaruan terakhir |

### sessions {#sessions}

Sesi login yang aktif. Setiap baris mengaitkan token sesi dengan seorang pengguna.

| Column | Type | Notes |
|---|---|---|
| `id` | varchar | Primary key (token sesi) |
| `userId` | uuid | Foreign key ke `users.id` |
| `expiresAt` | timestamp | Waktu kedaluwarsa |
| `createdAt` | timestamp | Waktu pembuatan |

### teams {#teams}

Grup untuk mengorganisasi pengguna. Admin dapat menetapkan pengguna ke team.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | varchar (unik, maks 50 karakter) | Nama team |
| `createdAt` | timestamp | Waktu pembuatan |

### api_keys {#api-keys}

API key untuk akses terprogram. Key mentah ditampilkan sekali saat pembuatan; hanya hash-nya yang disimpan.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `userId` | uuid | Foreign key ke `users.id` |
| `keyHash` | varchar | Hash scrypt dari key |
| `name` | varchar | Label yang diberikan pengguna |
| `createdAt` | timestamp | Waktu pembuatan |
| `lastUsedAt` | timestamp | Diperbarui pada setiap permintaan terautentikasi |

Key diawali dengan `si_` diikuti 96 karakter hex (48 byte acak).

### pipelines {#pipelines}

Rantai tool tersimpan yang dibuat pengguna di UI.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | varchar | Nama pipeline |
| `description` | varchar | Deskripsi opsional |
| `steps` | jsonb | Array objek `{ toolId, settings }` |
| `createdAt` | timestamp | Waktu pembuatan |

### user_files {#user-files}

Library file yang persisten. Hasil edit yang disimpan disisipkan sebagai baris root independen secara default ("save as new": `version` 1, `parentId` null, sehingga yang asli tetap terdaftar), atau sebagai versi yang tertaut ke parent saat Anda menimpa yang asli (`parentId` diatur, `version` ditambah, menggantikannya). Kolom `toolChain` mencatat tool yang diterapkan.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `userId` | uuid | FK ke users (CASCADE DELETE) |
| `originalName` | varchar | Nama file unggahan asli |
| `storedName` | varchar | Nama file di disk |
| `mimeType` | varchar | Tipe MIME |
| `size` | integer | Ukuran file dalam byte |
| `width` | integer | Lebar gambar dalam px |
| `height` | integer | Tinggi gambar dalam px |
| `version` | integer | Nomor versi (1 = asli) |
| `parentId` | uuid atau null | FK ke user_files (versi parent) |
| `toolChain` | jsonb | Tool ID yang diterapkan secara berurutan untuk menghasilkan versi ini |
| `createdAt` | timestamp | Waktu pembuatan |

### jobs {#jobs}

Melacak job pemrosesan untuk pelaporan progres dan pembersihan.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `type` | varchar | Pengidentifikasi tool atau pipeline |
| `status` | varchar | `queued`, `processing`, `completed`, atau `failed` |
| `progress` | real | Pecahan 0.0-1.0 |
| `inputFiles` | jsonb | Array path file input |
| `outputPath` | varchar | Path ke file hasil |
| `settings` | jsonb | Setting tool yang dipakai |
| `error` | varchar | Pesan error jika gagal |
| `createdAt` | timestamp | Waktu pembuatan |
| `completedAt` | timestamp | Waktu selesai |

### settings {#settings}

Key-value store untuk setting seluruh server yang dapat diubah admin dari UI.

| Column | Type | Notes |
|---|---|---|
| `key` | varchar | Primary key |
| `value` | varchar | Nilai setting |
| `updatedAt` | timestamp | Waktu pembaruan terakhir |

### roles {#roles}

Custom role dengan izin yang granular.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | varchar | Nama role yang unik |
| `description` | varchar | Deskripsi opsional |
| `permissions` | jsonb | Array string izin |
| `createdAt` | timestamp | Waktu pembuatan |

### audit_log {#audit-log}

Log aksi yang relevan dengan keamanan.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `userId` | uuid | FK ke users |
| `action` | varchar | Tipe aksi |
| `details` | jsonb | Data spesifik aksi |
| `createdAt` | timestamp | Waktu aksi |

### user_preferences {#user-preferences}

State UI per pengguna, dengan key berupa nama preferensi. Mendukung tool yang disematkan di dashboard lewat `PUT /api/v1/preferences`.

| Column | Type | Notes |
|---|---|---|
| `userId` | text | FK ke users, cascade saat delete. Primary key bersama `key` |
| `key` | text | Nama preferensi. Primary key bersama `userId` |
| `value` | jsonb | Payload preferensi |
| `updatedAt` | timestamp | Penulisan terakhir |

## Migrations {#migrations}

Drizzle menangani migrasi skema. File migrasi berada di `apps/api/drizzle/`. Selama pengembangan:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Di produksi, migrasi yang tertunda diterapkan otomatis saat startup.

## Least-privilege roles {#least-privilege-roles}

Dua role, dua tugas. `DATABASE_URL` melayani permintaan dan memegang `SELECT`, `INSERT`, `UPDATE`, `DELETE` pada tabel aplikasi plus `USAGE` dan `SELECT` pada sequence-nya. Hanya itu daftarnya. Ia tidak dapat membuat atau menghapus tabel, memasang extension, `TRUNCATE`, membaca `pg_authid`, membuat database, mengubah role, atau menyentuh schema `drizzle` tempat riwayat migrasi berada.

`DATABASE_MIGRATION_URL` adalah yang istimewa. Ia menjalankan migrasi dan memberi grant ke role runtime saat boot, lalu ditutup sebelum satu permintaan pun dilayani.

Pemisahan ini dirilis di SnapOtter 2.3.0. Mulai rilis itu file Compose di dalam repo dan image all-in-one dikabelkan seperti ini, termasuk instalasi yang sudah ada: saat boot SnapOtter membuat role runtime jika belum ada, memberinya grant, menjalankan migrasi, lalu menyapu grant ke tabel yang sudah ada sebelumnya. Upgrade tidak memerlukan SQL manual.

Image 2.2.0 hanya membaca connection string runtime dan tidak pernah membuat role kedua, jadi jika Anda memberinya pemisahan ini ia tidak pernah naik: log aplikasi menunjukkan autentikasi password gagal untuk role itu, dan log Postgres menyatakan role tidak ada. Upgrade image ke 2.3.0 atau yang lebih baru sebelum Anda mengalihkan file Compose ke pemisahan ini.

Membiarkan `DATABASE_MIGRATION_URL` kosong menjalankan satu role, dengan `DATABASE_URL` mengerjakan kedua tugas persis seperti sebelum pemisahan. Itu adalah konfigurasi yang didukung, bukan yang usang. Itu jawaban yang tepat pada Postgres terkelola, tempat pembuatan role sering bukan wewenang Anda.

### External and managed Postgres {#external-and-managed-postgres}

Di RDS, Supabase, Cloud SQL, atau cluster apa pun yang Anda jalankan sendiri, pemisahan ini bersifat opt-in. Buat role runtime sekali:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Lalu berikan kedua connection string kepada SnapOtter, menunjuk ke host, port, dan database yang sama:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Cukup sampai di situ. SnapOtter menerapkan grant sendiri dan menerapkannya ulang setelah setiap migrasi, sehingga tabel yang ditambahkan rilis mendatang tercakup tanpa ada yang menjalankan SQL untuknya.

Role di `DATABASE_MIGRATION_URL` harus memiliki tabel SnapOtter, karena hanya pemilik tabel yang dapat memberi grant padanya. Pada instalasi yang sudah ada itu berarti role yang selama ini Anda pakai untuk menjalankan SnapOtter, bukan yang baru dibuat untuk keperluan ini. Arahkan ke role baru yang tidak memiliki apa pun dan boot gagal dengan error yang menyatakan persis hal ini. Role itu juga memerlukan `CREATEROLE` untuk membuat dan memelihara role runtime, dan hak untuk membuat schema `drizzle`.

Sebut role yang sama di kedua URL dan pemisahan dimatikan, dan SnapOtter menyatakannya di log alih-alih berpura-pura sebaliknya. Jika penyedia Anda tidak memberi role yang dapat sekaligus memiliki tabel dan memegang `CREATEROLE`, jalankan satu role.

### Why the superuser bit is left alone {#why-the-superuser-bit-is-left-alone}

SnapOtter tidak pernah mencabut `SUPERUSER` dari sebuah role dengan sendirinya. Pada instalasi yang dibuat sebelum pemisahan, `snapotter` adalah satu-satunya superuser cluster, dan menurunkannya akan membuat cluster tanpa superuser, yang hanya dapat dipulihkan lewat single-user mode dengan server dihentikan. Memindahkan koneksi berumur panjang ke role terbatas itulah yang memberi perlindungan. Superuser berada di jalur koneksi hanya selama beberapa detik saat boot lalu hilang.

Instalasi all-in-one yang baru tidak pernah mengalami masalah itu. Mereka mendapat tiga role: `postgres` (superuser bootstrap, tidak ada di connection string mana pun yang dipakai SnapOtter), `snapotter` (`NOSUPERUSER`, memiliki data, terhubung hanya saat boot), dan `snapotter_app` (hanya baris, melayani permintaan).

Untuk tetap menurunkan `snapotter` yang lebih lama, buat superuser kedua terlebih dahulu dan login sebagai dia untuk memastikan berfungsi. Lalu `ALTER ROLE snapotter NOSUPERUSER`.

## Backup and restore {#backup-and-restore}

Database relasional berada di volume `SnapOtter-pgdata` milik container Postgres, bukan volume `/data` milik aplikasi.

**Backup logis dengan validasi (disarankan)**

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

Kedua perintah terhubung sebagai `snapotter`, sang pemilik, dan sebaiknya tetap begitu. Role runtime tidak dapat melihat schema `drizzle`, sehingga dump yang diambil sebagai role itu akan tidak lengkap. `--no-owner` membiarkan objek yang dipulihkan dimiliki oleh siapa pun yang menjalankan restore, jadi menjalankannya sebagai pemilik menempatkan kepemilikan sesuai harapan grant. Satu hal pada cluster baru: `pg_dump` membawa grant tetapi tidak role yang disebutnya, jadi buat `snapotter_app` sebelum restore atau `--exit-on-error` berhenti pada `GRANT` pertama. SnapOtter menerapkan ulang grant pada boot berikutnya apa pun yang terjadi.

Dump database ini tidak berisi objek library tersimpan di `/data/files` atau state BullMQ yang tahan lama di Redis. Cadangkan dan pulihkan keduanya dengan prosedur terkoordinasi di [Security & Hardening](/hi/guide/security#backup-and-recovery).

**Snapshot volume dingin**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Jangan menyalin direktori data PostgreSQL yang sedang berjalan dengan `tar`. Compose memberi prefix project pada nama volume, jadi tentukan ID volume yang ter-mount dari `docker inspect` atau platform storage Anda alih-alih mengasumsikan label literal `SnapOtter-pgdata`.

### Migrating from 1.x (SQLite) {#migrating-from-1-x-sqlite}

Upgrade dari SnapOtter 1.x punya panduan tersendiri: lihat [Upgrading from 1.x to 2.0](./upgrading). Singkatnya, pakai ulang volume `/data` Anda yang ada dan 2.0 mendeteksi otomatis dan mengimpor `/data/snapotter.db` saat first boot (atau atur `SQLITE_MIGRATE_PATH` untuk menunjuknya secara eksplisit). Cadangkan seluruh volume `/data` terlebih dahulu, bukan hanya `snapotter.db`: 1.x memakai mode WAL SQLite, jadi container yang dihentikan sering meninggalkan sebagian besar datanya di `snapotter.db-wal` di samping `snapotter.db` yang hampir kosong.