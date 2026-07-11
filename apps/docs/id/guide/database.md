---
description: "Skema database PostgreSQL, tabel, migrasi, dan prosedur pencadangan untuk SnapOtter."
i18n_source_hash: b37398ae91a3
i18n_provenance: human
i18n_output_hash: 8a963902d4f7
---

# Database {#database}

SnapOtter menggunakan PostgreSQL 17 dengan [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) untuk persistensi data. Skema didefinisikan di `apps/api/src/db/schema.ts`.

Koneksi dikonfigurasi melalui variabel lingkungan `DATABASE_URL` (default `postgres://snapotter:snapotter@postgres:5432/snapotter`). Di Docker Compose, kontainer Postgres menyimpan datanya di volume bernama `SnapOtter-pgdata`.

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

Pustaka file persisten dengan pelacakan rantai versi. Setiap langkah pemrosesan yang menyimpan hasil membuat baris baru yang tertaut ke induknya melalui `parentId`, membentuk sebuah pohon versi.

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

## Migrasi {#migrations}

Drizzle menangani migrasi skema. File migrasi berada di `apps/api/drizzle/`. Selama pengembangan:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Di produksi, migrasi yang tertunda diterapkan secara otomatis saat startup.

## Pencadangan dan pemulihan {#backup-and-restore}

Database relasional berada di volume `SnapOtter-pgdata` kontainer Postgres, bukan di volume `/data` aplikasi.

**Opsi 1: pg_dump (direkomendasikan)**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**Opsi 2: Snapshot volume**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Migrasi dari 1.x (SQLite) {#migrating-from-1-x-sqlite}

Memutakhirkan dari SnapOtter 1.x memiliki panduannya sendiri: lihat [Memutakhirkan dari 1.x ke 2.0](./upgrading). Singkatnya, gunakan kembali volume `/data` Anda yang ada dan 2.0 otomatis mendeteksi serta mengimpor `/data/snapotter.db` pada boot pertama (atau atur `SQLITE_MIGRATE_PATH` untuk menunjuk ke sana secara eksplisit). Cadangkan seluruh volume `/data` terlebih dahulu, bukan hanya `snapotter.db`: 1.x menggunakan mode SQLite WAL, sehingga kontainer yang dihentikan sering meninggalkan sebagian besar datanya di `snapotter.db-wal` di samping `snapotter.db` yang hampir kosong.
