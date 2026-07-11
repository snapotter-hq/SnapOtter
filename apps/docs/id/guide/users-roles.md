---
description: "Kelola pengguna, peran bawaan dan kustom, izin, kunci API, tim, sesi, dan log audit di SnapOtter."
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: 1ffa8126804f
---

# Pengguna, Peran & Izin {#users-roles-permissions}

SnapOtter hadir dengan tiga peran bawaan, 17 izin granular, dan dukungan untuk peran kustom dengan kontrol akses per alat opsional. Halaman ini membahas model otorisasi lengkap, pembatasan cakupan kunci API, manajemen tim, dan pencatatan audit.

::: tip Halaman terkait
[OIDC / SSO](/id/guide/oidc) | [SAML SSO](/id/guide/saml) | [SCIM Provisioning](/id/guide/scim) | [Security & Hardening](/id/guide/security)
:::

## Pengguna {#users}

### Membuat pengguna {#creating-users}

Admin dapat membuat pengguna melalui panel admin atau endpoint `POST /api/auth/register`. Setiap pengguna memiliki username, peran, penetapan tim, dan alamat email opsional.

### Admin bawaan {#default-admin}

Pada startup pertama SnapOtter membuat akun admin bawaan. Kredensialnya berasal dari variabel lingkungan:

| Variabel | Bawaan | Deskripsi |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | Username untuk akun admin awal |
| `DEFAULT_PASSWORD` | `admin` | Kata sandi untuk akun admin awal |

Admin bawaan diwajibkan mengubah kata sandinya saat login pertama.

### Penyedia autentikasi {#authentication-providers}

Pengguna dapat terautentikasi melalui beberapa metode:

- **Lokal** - username dan kata sandi disimpan di database SnapOtter
- **OIDC** - penyedia OpenID Connect apa pun (lihat [OIDC / SSO](/id/guide/oidc))
- **SAML** - penyedia identitas SAML 2.0 (lihat [SAML SSO](/id/guide/saml))
- **SCIM** - provisioning otomatis dari penyedia identitas (lihat [SCIM Provisioning](/id/guide/scim))

### Menonaktifkan autentikasi {#disabling-authentication}

Setel `AUTH_ENABLED=false` untuk menonaktifkan autentikasi sepenuhnya. Dalam mode ini, pengguna anonim sintetis dengan peran `admin` digunakan untuk semua permintaan. Tidak ada login yang diperlukan.

::: warning 
Menonaktifkan autentikasi memberikan akses admin penuh kepada siapa pun yang dapat menjangkau instans. Hanya gunakan ini di lingkungan tepercaya.
:::

## Peran bawaan {#built-in-roles}

SnapOtter menyertakan tiga peran bawaan. Peran-peran ini tidak dapat diubah atau dihapus.

### Admin {#admin}

Semua 17 izin. Kontrol penuh atas instans.

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### Editor {#editor}

7 izin. Dapat menggunakan semua alat dan mengelola semua file serta pipeline, tetapi tidak dapat mengakses fungsi admin.

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### User {#user}

5 izin. Dapat menggunakan alat dan mengelola sumber dayanya sendiri.

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## Referensi izin {#permissions-reference}

| Izin | Deskripsi |
|---|---|
| `tools:use` | Menggunakan alat pemrosesan apa pun |
| `files:own` | Melihat dan mengelola file sendiri |
| `files:all` | Melihat dan mengelola file semua pengguna |
| `apikeys:own` | Membuat dan mengelola kunci API sendiri |
| `apikeys:all` | Melihat kunci API semua pengguna |
| `pipelines:own` | Membuat dan mengelola pipeline sendiri |
| `pipelines:all` | Melihat dan mengelola pipeline semua pengguna |
| `settings:read` | Melihat pengaturan instans |
| `settings:write` | Mengubah pengaturan instans |
| `users:manage` | Membuat, memperbarui, dan menghapus akun pengguna |
| `teams:manage` | Membuat, memperbarui, dan menghapus tim |
| `features:manage` | Menginstal dan mengelola bundel fitur AI |
| `system:health` | Mengakses endpoint health dan readiness |
| `audit:read` | Melihat log audit dan mendaftar peran |
| `compliance:manage` | Mengelola siklus hidup GDPR dan fitur kepatuhan |
| `webhooks:manage` | Mengonfigurasi webhook keluar |
| `security:manage` | Mengelola pengaturan keamanan (daftar izin IP, penegakan SSO) |

## Peran kustom {#custom-roles}

Admin dengan izin `security:manage` dapat membuat peran kustom melalui panel admin atau API peran. Mendaftar peran memerlukan `audit:read`.

### Membuat peran kustom {#creating-a-custom-role}

```bash
curl -X POST http://localhost:1349/api/v1/roles \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "reviewer",
    "description": "Can use tools and view all files",
    "permissions": ["tools:use", "files:own", "files:all", "settings:read"]
  }'
```

Nama peran harus 2-30 karakter, alfanumerik huruf kecil dengan tanda hubung dan garis bawah.

### Izin yang dicadangkan untuk admin {#admin-reserved-permissions}

Tiga izin dicadangkan untuk peran bawaan dan tidak dapat diberikan ke peran kustom:

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

API peran menolak permintaan apa pun yang menyertakan izin-izin ini. Hanya peran `admin` bawaan yang memiliki akses ke izin-izin tersebut.

### Izin tingkat alat {#tool-level-permissions}

Peran kustom dapat secara opsional membatasi alat mana yang boleh diakses pengguna. Dua mode tersedia:

| Mode | Perilaku | Persyaratan lisensi |
|---|---|---|
| `category` | Membatasi berdasarkan modalitas (image, video, audio, document, file) | Tidak ada (gratis) |
| `tool` | Membatasi berdasarkan ID alat individual | Memerlukan fitur enterprise `per_tool_permissions` |

Ketika mode `tool` disetel tetapi fitur enterprise tidak tersedia, SnapOtter menurunkan secara mulus dan mengizinkan akses ke semua alat.

```json
{
  "name": "image-only",
  "permissions": ["tools:use", "files:own"],
  "toolPermissions": {
    "mode": "category",
    "allowed": ["image"]
  }
}
```

### Menghapus peran kustom {#deleting-a-custom-role}

Saat peran kustom dihapus, semua pengguna yang ditetapkan padanya secara otomatis ditetapkan ulang ke peran `user`.

## Tim {#teams}

Tim mengelompokkan pengguna untuk manajemen penyimpanan dan retensi. Sebuah tim `Default` dibuat pada startup pertama.

| Bidang | Tipe | Deskripsi |
|---|---|---|
| `name` | string | Nama tim unik (1-50 karakter) |
| `storageQuota` | number | Batas penyimpanan per tim dalam byte (berfungsi tanpa enterprise) |
| `retentionHours` | number | Hapus otomatis output setelah sekian jam (memerlukan `team_retention_overrides`, enterprise) |
| `legalHold` | boolean | Mencegah penghapusan otomatis file anggota tim (memerlukan `legal_hold`, enterprise) |

::: info 
Tim `Default` tidak dapat dihapus. Tim yang masih memiliki anggota tidak dapat dihapus. Tetapkan ulang anggota terlebih dahulu.
:::

## Kunci API {#api-keys}

Pengguna dapat membuat kunci API untuk akses programatik. Setiap kunci menggunakan awalan `si_` dan hanya ditampilkan sekali saat pembuatan.

### Izin bercakupan {#scoped-permissions}

Kunci API dapat secara opsional membawa array `permissions`. Saat disetel, izin efektif untuk suatu permintaan adalah **irisan** dari izin peran pengguna dan izin bercakupan milik kunci. Ini berarti kunci API tidak pernah dapat melampaui izin pengguna itu sendiri.

```bash
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI pipeline key",
    "permissions": ["tools:use", "files:own"],
    "expiresAt": "2027-01-01T00:00:00Z"
  }'
```

### Kedaluwarsa {#expiration}

Kunci menerima timestamp `expiresAt` opsional. Kunci yang kedaluwarsa ditolak pada saat autentikasi.

## Log audit {#audit-log}

SnapOtter mencatat peristiwa yang relevan dengan keamanan dalam log audit terstruktur yang disimpan di tabel database `audit_log`.

### Melihat log audit {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

Memerlukan izin `audit:read`. Mendukung paginasi (`page`, `limit`) dan filter (`action`, `ip`, `from`, `to`).

### Pengauditan operasi alat {#tool-operation-auditing}

::: warning 
Peristiwa `TOOL_EXECUTED` **tidak** dicatat secara bawaan. Peristiwa ini bersifat opt-in melalui salah satu dari dua jalur:

1. Setel pengaturan admin `auditToolOperations` ke `true`.
2. Miliki lisensi aktif dengan fitur `audit_export` (tersedia pada paket team dan enterprise).

Tanpa salah satu dari ini, eksekusi alat individual tidak dicatat dalam log audit.
:::

### Mengekspor {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

Memerlukan izin `audit:read` dan fitur enterprise `audit_export` (tersedia pada paket team dan enterprise). Mendukung format CSV dan JSON, difilter berdasarkan `action`, `actorId`, `targetType`, `targetId`, `from`, dan `to`.

### Penandatanganan anti-manipulasi {#tamper-resistant-signing}

Saat diaktifkan, setiap entri log audit ditandatangani dengan HMAC yang diturunkan dari `DATA_ENCRYPTION_KEY`. Ini memerlukan:

1. Menyetel `DATA_ENCRYPTION_KEY` di lingkungan Anda.
2. Mengaktifkan pengaturan admin `tamperResistantAudit`.
3. Lisensi enterprise dengan fitur `tamper_resistant_audit`.

### Retensi {#retention}

Setel `AUDIT_RETENTION_DAYS` untuk secara otomatis membersihkan entri lama. Bawaannya adalah `0`, yang berarti entri disimpan tanpa batas waktu.

### Referensi peristiwa {#event-reference}

| Peristiwa | Kategori |
|---|---|
| `LOGIN_SUCCESS`, `LOGIN_FAILED` | Authentication |
| `OIDC_LOGIN_SUCCESS`, `OIDC_LOGIN_FAILED` | Authentication |
| `SAML_LOGIN_SUCCESS`, `SAML_LOGIN_FAILED` | Authentication |
| `LOGOUT` | Authentication |
| `USER_CREATED`, `USER_UPDATED`, `USER_DELETED` | User management |
| `PASSWORD_CHANGED`, `PASSWORD_RESET` | User management |
| `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`, `MFA_RECOVERY_USED`, `MFA_RESET` | MFA |
| `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | Roles |
| `API_KEY_CREATED`, `API_KEY_DELETED` | API keys |
| `SETTINGS_UPDATED`, `IP_ALLOWLIST_UPDATED` | Settings |
| `FILE_UPLOADED`, `FILE_DELETED` | Files |
| `TOOL_EXECUTED` | Tools (opt-in) |
| `SCIM_USER_PROVISIONED`, `SCIM_USER_UPDATED`, `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`, `LEGAL_HOLD_RELEASED` | Compliance |
| `GDPR_EXPORT_INITIATED`, `GDPR_USER_PURGED`, `GDPR_TEAM_PURGED` | Compliance |
| `CONFIG_EXPORTED`, `CONFIG_IMPORTED` | Configuration |

## Manajemen sesi {#session-management}

Sesi berbasis cookie, dikendalikan oleh `SESSION_DURATION_HOURS` (bawaan: 168 jam / 7 hari).

### Perubahan peran membatalkan sesi {#role-changes-invalidate-sessions}

Saat admin mengubah peran pengguna, semua sesi aktif pengguna tersebut dihapus. Pengguna harus login lagi untuk mendapatkan izin barunya.

### Pengaman keamanan {#safety-guards}

- **Perlindungan admin terakhir**: admin terakhir yang tersisa tidak dapat diturunkan ke peran yang lebih rendah. API mengembalikan error jika Anda mencoba.
- **Pencegahan hapus diri**: admin tidak dapat menghapus akunnya sendiri melalui API.
