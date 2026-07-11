---
description: "Siapkan provisioning SCIM 2.0 untuk menyinkronkan pengguna dan grup dari penyedia identitas Anda ke SnapOtter. Mencakup Okta, Azure AD / Entra ID, dan integrasi kustom."
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: a7f596c5fea9
---

# Provisioning SCIM {#scim-provisioning}

SnapOtter mengimplementasikan SCIM 2.0 (System for Cross-domain Identity Management) untuk provisioning pengguna dan grup secara otomatis. Penyedia identitas Anda dapat membuat, memperbarui, menonaktifkan, dan mengaktifkan kembali akun pengguna serta menyinkronkan keanggotaan grup secara otomatis.

::: tip Fitur enterprise
Provisioning SCIM memerlukan lisensi **enterprise** dengan fitur `scim`. Fitur ini tidak tersedia pada paket team. Tanpa fitur tersebut, semua endpoint SCIM (kecuali discovery) mengembalikan 403.
:::

## Prasyarat {#prerequisites}

- Sebuah instance SnapOtter yang berjalan dan dapat dijangkau melalui URL publik
- Kunci lisensi enterprise dengan fitur `scim`
- Akses admin ke SnapOtter (izin `users:manage` diperlukan untuk membuat atau mencabut token SCIM)
- Akses admin ke pengaturan provisioning penyedia identitas Anda

## Mulai cepat {#quick-start}

1. Buat token bearer SCIM:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

Respons berisi token tersebut. Simpan segera; token tidak dapat diambil kembali.

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. Pada penyedia identitas Anda, konfigurasikan provisioning SCIM dengan:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Authentication**: Bearer token (tempel token dari langkah 1)

## Autentikasi {#authentication}

Endpoint SCIM menggunakan Bearer token khusus, terpisah dari sesi pengguna dan API key.

### Membuat token {#generating-a-token}

`POST /api/v1/enterprise/scim/token` membuat token SCIM baru. Endpoint ini memerlukan sesi valid dengan izin `users:manage`.

Token dikembalikan dalam bentuk teks biasa tepat satu kali. SnapOtter hanya menyimpan hash scrypt. Jika Anda kehilangan token, cabut token tersebut dan buat yang baru.

Hanya satu token SCIM yang aktif pada satu waktu. Membuat token baru akan menggantikan token sebelumnya.

### Mencabut token {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` mencabut token SCIM saat ini. Endpoint ini juga memerlukan `users:manage`.

### Pembatasan laju {#rate-limiting}

Endpoint SCIM dibatasi hingga 1000 permintaan per menit per token. Melebihi batas ini mengembalikan HTTP 429.

## Resource yang didukung {#supported-resources}

| Resource SCIM | Konsep SnapOtter | Create | Read | Update | Delete |
|---|---|---|---|---|---|
| User | Akun pengguna | Ya | Ya | Ya | Soft delete |
| Group | Team | Ya | Ya | Ya | Ya |

::: warning 
SCIM Group dipetakan ke **team** SnapOtter, bukan role. SCIM tidak dapat mengatur role seorang pengguna. Semua pengguna yang dibuat melalui SCIM diberi role `user`. Untuk mengubah role pengguna, gunakan UI admin SnapOtter.
:::

## Operasi pengguna {#user-operations}

### Buat pengguna {#create-user}

`POST /api/v1/scim/v2/Users`

Membuat akun pengguna baru dengan `authProvider` diatur ke `scim` dan role `user`. Pengguna ditugaskan ke team Default. Jika `active` bernilai `false`, role diatur ke `disabled` sebagai gantinya.

Atribut wajib: `userName`. Opsional: `externalId`, `emails`, `active` (default `true`).

### Daftar dan filter pengguna {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

Mengembalikan daftar pengguna dengan paginasi. Mendukung parameter kueri `startIndex` dan `count` (maksimum 200 hasil per halaman).

Filtering hanya mendukung `eq` (equals), pada atribut berikut:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

Operator filter dan atribut lain mengembalikan HTTP 400.

### Ambil pengguna {#get-user}

`GET /api/v1/scim/v2/Users/:id`

Mengembalikan satu pengguna berdasarkan ID pengguna SnapOtter mereka.

### Ganti pengguna {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

Mengganti atribut pengguna. Mendukung `userName`, `externalId`, `emails`, dan `active`. Perubahan username diperiksa untuk konflik (409 jika username baru sudah dipakai pengguna lain).

### Patch pengguna {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

Pembaruan sebagian menggunakan SCIM PatchOp. Operasi yang didukung:

| Operasi | Path |
|---|---|
| `replace` | `active`, `userName`, `externalId`, `emails`, `emails[type eq "work"].value`, `name.formatted`, `displayName` |
| `add` | Sama seperti `replace` |
| `remove` | `externalId`, `emails` |

Path `name.formatted` dan `displayName` diterima demi kompatibilitas tetapi tidak memiliki efek persisten (SnapOtter tidak menyimpan display name terpisah).

Operasi `replace` tanpa nilai (di mana value adalah objek tanpa `path`) juga didukung, dengan kunci `userName`, `externalId`, `emails`, dan `active`.

### Nonaktifkan pengguna (soft delete) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter tidak menghapus pengguna secara permanen melalui SCIM. Sebaliknya, DELETE melakukan deaktivasi lunak:

1. Role pengguna diubah dari nilai saat ini (mis. `editor`) menjadi `disabled:editor`, sambil menyimpan role aslinya.
2. Kata sandi pengguna dihapus.
3. Semua sesi aktif dicabut.
4. Semua API key dicabut.

Pengguna tidak lagi dapat masuk atau menggunakan API key mana pun. Data mereka (file, riwayat) tetap dipertahankan.

### Aktifkan kembali pengguna {#reactivate-user}

Untuk mengaktifkan kembali pengguna yang sebelumnya dinonaktifkan, kirim permintaan `PUT` atau `PATCH` dengan `active: true`. SnapOtter memulihkan role asli dari sebelum deaktivasi (mis. `disabled:editor` menjadi `editor` lagi). Jika role asli tidak dapat ditentukan, akan kembali ke `user`.

::: details Contoh: nonaktifkan dan aktifkan kembali melalui PATCH
```json
// Deactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": false }
  ]
}

// Reactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": true }
  ]
}
```
:::

## Operasi grup {#group-operations}

SCIM Group dipetakan ke team SnapOtter. Membuat grup akan membuat team. Keanggotaan grup mengontrol team mana yang menjadi milik seorang pengguna.

### Buat grup {#create-group}

`POST /api/v1/scim/v2/Groups`

Wajib: `displayName`. Opsional: `members` (array dari `{ value: userId }`).

### Daftar dan filter grup {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

Filtering hanya mendukung `displayName eq "..."`. Dengan paginasi `startIndex` dan `count` (maksimum 200 hasil per halaman).

### Ambil grup {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### Ganti grup {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

Mengganti nama grup dan seluruh daftar keanggotaan. Anggota yang ada namun tidak ada dalam daftar baru dipindahkan ke team Default.

### Patch grup {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

Mendukung operasi berikut:

| Operasi | Path | Efek |
|---|---|---|
| `add` | `members` | Menambahkan pengguna ke team |
| `remove` | `members[value eq "userId"]` | Memindahkan pengguna ke team Default |
| `replace` | `displayName` | Mengubah nama team |
| `replace` | `members` | Mengganti semua anggota (anggota yang dihapus dipindahkan ke team Default) |

### Hapus grup {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

Menghapus team. Semua anggota team yang dihapus dipindahkan ke team Default. Pengguna tidak dinonaktifkan atau dihapus.

## Penyiapan IdP {#idp-setup}

### Okta {#okta}

1. Di konsol admin Okta, buka aplikasi SnapOtter Anda (atau buat baru).
2. Buka tab **Provisioning** dan klik **Configure API Integration**.
3. Centang **Enable API Integration** dan masukkan:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **API Token**: Token bearer SCIM yang dibuat di atas
4. Klik **Test API Credentials**, lalu **Save**.
5. Di bawah **Provisioning > To App**, aktifkan:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. Di bawah **Push Groups**, konfigurasikan grup Okta mana yang akan disinkronkan sebagai team SnapOtter.

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Di portal Azure, buka aplikasi enterprise SnapOtter Anda.
2. Buka **Provisioning** dan atur **Provisioning Mode** ke **Automatic**.
3. Di bawah **Admin Credentials**, masukkan:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: Token bearer SCIM yang dibuat di atas
4. Klik **Test Connection**, lalu **Save**.
5. Di bawah **Mappings**, konfigurasikan pemetaan atribut pengguna dan grup. Nilai default biasanya sudah berfungsi, tetapi pastikan `userName` dipetakan ke `userPrincipalName` atau `mail` sesuai keinginan.
6. Atur **Provisioning Status** ke **On** dan simpan.

Azure melakukan provisioning pengguna dan grup pada siklus sinkronisasi tetap (biasanya setiap 40 menit).

## Endpoint discovery {#discovery-endpoints}

Ketiga endpoint ini tersedia tanpa autentikasi dan menjelaskan kemampuan server SCIM:

| Endpoint | Deskripsi |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | Kemampuan server dan fitur yang didukung |
| `GET /api/v1/scim/v2/Schemas` | Definisi skema User dan Group |
| `GET /api/v1/scim/v2/ResourceTypes` | Tipe resource yang tersedia (User, Group) |

`ServiceProviderConfig` mengiklankan kemampuan berikut:

| Fitur | Didukung |
|---|---|
| Patch | Ya |
| Bulk | Tidak |
| Filter | Ya (maks 200 hasil, hanya operator `eq`) |
| Change password | Tidak |
| Sort | Tidak |
| ETag | Tidak |

## Batasan {#limitations}

- **Filtering**: Hanya operator `eq` yang didukung. Filter kompleks, operator `and`/`or`, `co` (contains), dan `sw` (starts with) tidak diimplementasikan.
- **Operasi bulk**: Tidak didukung.
- **Sort dan ETag**: Tidak didukung.
- **Role**: SCIM tidak dapat menetapkan role SnapOtter. Semua pengguna yang di-provisioning mendapat role `user`.
- **MAX_USERS**: Batas variabel lingkungan `MAX_USERS` tidak diberlakukan pada pembuatan pengguna via SCIM. Jika Anda perlu membatasi jumlah pengguna, kelola penugasan di IdP Anda.
- **Satu token**: Hanya satu token SCIM yang dapat aktif pada satu waktu. Jika beberapa IdP membutuhkan akses SCIM, mereka harus berbagi token.
- **Grup adalah team**: SCIM Group berhubungan dengan team, bukan role atau grup izin.

## Pemecahan masalah {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

Lisensi Anda tidak menyertakan fitur `scim`, atau tidak ada lisensi yang dikonfigurasi. SCIM memerlukan lisensi paket enterprise. Pastikan `SNAPOTTER_LICENSE_KEY` telah diatur dan lisensi menyertakan fitur `scim`.

### 401 "Bearer token required" {#_401-bearer-token-required}

Permintaan SCIM tidak menyertakan header `Authorization: Bearer <token>`. Periksa konfigurasi provisioning IdP Anda.

### 401 "Invalid token" {#_401-invalid-token}

Token tidak cocok dengan hash yang tersimpan. Ini terjadi jika token dicabut dan dibuat ulang. Perbarui token di pengaturan provisioning IdP Anda.

### 401 "SCIM not configured" {#_401-scim-not-configured}

Belum ada token SCIM yang dibuat. Gunakan endpoint `POST /api/v1/enterprise/scim/token` untuk membuatnya.

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

Pengguna dengan username yang sama sudah ada. Ini dapat terjadi ketika IdP mencoba ulang pembuatan yang gagal. Periksa username duplikat di panel admin SnapOtter.

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

IdP mengirim lebih dari 1000 permintaan per menit. Ini biasanya terjadi selama sinkronisasi awal yang besar. Sebagian besar IdP otomatis mencoba ulang setelah jendela pembatasan laju direset. Jika masalah berlanjut, periksa interval sinkronisasi provisioning IdP Anda.

### Pengguna di-deprovisioning tetapi tidak dihapus dari UI {#users-deprovisioned-but-not-removed-from-the-ui}

SCIM DELETE adalah deaktivasi lunak. Pengguna yang dinonaktifkan tetap muncul dalam daftar pengguna admin dengan status dinonaktifkan. Ini disengaja agar data mereka tetap terjaga. Role mereka ditampilkan sebagai `disabled:<original-role>`.
