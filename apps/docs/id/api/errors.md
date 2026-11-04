---
title: "Kode error"
description: "Bentuk isi error, kode-kode yang stabil, dan apa yang perlu dilakukan untuk masing-masing kode."
i18n_source_hash: ed6e0590a6fd
i18n_provenance: machine
i18n_output_hash: 7029313c232c
i18n_hash_version: 2
---

# Kode error {#error-codes}

Setiap respons error JSON memiliki bentuk yang sama:

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| Field | Selalu ada | Arti |
|-------|----------------|---------|
| `error` | Ya | Pesan yang mudah dibaca manusia. Aman ditampilkan kepada pengguna. Jangan di-parse. |
| `code` | Ya | Kode yang stabil dan dapat dibaca mesin. Gunakan ini untuk percabangan logika. |
| `requestId` | Ya | ID server untuk permintaan ini. Sertakan saat Anda melaporkan masalah; ID ini cocok dengan log server. |
| `details` | Kadang-kadang | Konteks tambahan untuk beberapa error 4xx, seperti pesan validasi. |

Pesan dapat berubah antar rilis. Kode tidak berubah, jadi tulis logika klien berdasarkan `code`.

## Kode dari status HTTP {#status-codes}

Jika sebuah rute tidak menetapkan kodenya sendiri, server menurunkan kode dari status:

| Status HTTP | `code` |
|-------------|--------|
| 400 | `BAD_REQUEST` |
| 401 | `AUTH_REQUIRED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `UNPROCESSABLE_ENTITY` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 501 | `NOT_IMPLEMENTED` |
| 503 | `SERVICE_UNAVAILABLE` |
| 507 | `INSUFFICIENT_STORAGE` |

Status 4xx lainnya menggunakan `BAD_REQUEST`, dan status 5xx lainnya menggunakan `INTERNAL_ERROR`.

Sebuah rute dapat menetapkan kode yang lebih spesifik, dan respons akan membawa kode tersebut. Misalnya, alat yang tidak dapat berjalan karena bundel AI-nya hilang akan mengembalikan kode khusus fitur. Kode-kode itu dijelaskan bersama fitur yang memunculkannya.

## Autentikasi dan akses {#auth-codes}

| `code` | Status | Yang perlu dilakukan |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | Kirim `Authorization: Bearer <token>` dengan token sesi atau kunci API (`si_...`). |
| `FORBIDDEN` | 403 | Kredensial valid tetapi tidak memiliki izin. Minta izin tersebut kepada admin. |
| `MUST_CHANGE_PASSWORD` | 403 | Akun harus mengganti kata sandinya sebelum dapat memanggil endpoint lain. Panggil `POST /api/auth/change-password` dengan token sesi, lalu coba lagi. |
| `USER_DISABLED` | 403 | Akun dinonaktifkan. Admin harus mengaktifkannya kembali. |
| `LOGIN_THROTTLED` | 429 | Terlalu banyak percobaan masuk yang gagal. Tunggu sebelum mencoba lagi. |
| `VALIDATION_ERROR` | 400 | Isi atau parameter permintaan gagal validasi. `details` menyebutkan masalahnya. |

Akun admin pertama adalah `admin` dengan kata sandi `admin` kecuali `DEFAULT_USERNAME` atau `DEFAULT_PASSWORD` mengubahnya. Kecuali `SKIP_MUST_CHANGE_PASSWORD` diatur, akun tersebut mendapat `MUST_CHANGE_PASSWORD` pada setiap panggilan sampai kata sandi diganti.

## Job {#job-codes}

Job yang gagal melaporkan alasannya pada job itu sendiri, bukan pada error HTTP. Baca `error.code` dan `error.message` dari `GET /api/v1/jobs/{jobId}`. Lihat [Pelacakan Progres](/id/api/rest#progress-tracking).

Job yang gagal menyimpan `error.code` hanya jika kegagalannya berupa error input atau kesalahan server. Kegagalan lainnya hanya membawa pesan.

| `code` | Arti | Yang perlu dilakukan |
|--------|--------|------------|
| `CANCELED` | Job dibatalkan oleh pengguna. Ini bukan status HTTP. Event progres membawa `phase: failed` dengan kode ini. | Perlakukan sebagai pembatalan oleh pengguna. Jangan coba lagi secara otomatis. |
| `INPUT_MISSING` | Input dihapus sebelum job berjalan. | Unggah file lagi. |
| `ENGINE_UNAVAILABLE` | Engine yang diperlukan tidak dapat dijalankan di server. | Coba lagi setelah administrator memperbaiki instalasi. |

## Autentikasi dan MFA {#mfa-codes}

| `code` | Status | Arti | Yang perlu dilakukan |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | Kebijakan MFA mewajibkan pendaftaran, dan instance ini tidak dapat mendaftarkan pengguna (tanpa lisensi enterprise). Instance berlisensi mengembalikan 200 dengan `requiresMfaEnrollment: true` dan memandu pengguna melalui pendaftaran. | Jangan coba lagi. Administrator harus mengubah kebijakan atau menggunakan CLI pemulihan offline. |
| `MFA_POLICY_UNAVAILABLE` | 503 | Server tidak dapat membaca kebijakan MFA saat masuk. | Coba masuk lagi sebentar lagi. |
| `INVALID_CODE` | 401 | Kode TOTP atau kode pemulihan salah. | Minta kode baru dari pengguna lalu coba lagi. Kegagalan berulang berakhir dengan `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Terlalu banyak kode yang salah. Tantangan (challenge) dibuang. | Mulai proses masuk lagi untuk mendapatkan challenge baru. |
| `MFA_EXPIRED` | 401 | Challenge MFA atau pendaftaran kedaluwarsa atau tidak cocok. | Mulai proses masuk lagi. |
| `MFA_NOT_CONFIGURED` | 401 | Akun tidak memiliki rahasia TOTP, sehingga kode tidak dapat diperiksa. | Daftarkan MFA sebelum masuk dengan kode. |
| `MFA_ALREADY_ENABLED` | 409 | MFA sudah aktif pada akun. | Jangan mendaftar lagi. |
| `NO_PENDING_ENROLLMENT` | 400 | Konfirmasi pendaftaran diterima tanpa pendaftaran yang tertunda. | Panggil endpoint pendaftaran terlebih dahulu. |
| `MFA_NOT_ENABLED` | 400 | Tindakan ini memerlukan MFA aktif, dan MFA nonaktif untuk pengguna ini. | Lewati tindakan tersebut, atau aktifkan MFA terlebih dahulu. |
| `MFA_DECRYPTION_FAILED` | 500 | Rahasia TOTP yang tersimpan tidak dapat didekripsi. | Tindakan operator. Biasanya ini berarti kunci enkripsi berubah. Periksa `DATA_ENCRYPTION_KEY` dan `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Nilai yang tersimpan (pengaturan, header autentikasi webhook, atau rahasia TOTP) tidak dapat didekripsi. | Tindakan operator, seperti di atas. Jangan coba lagi. |
| `IDLE_TIMEOUT` | 401 | Sesi kedaluwarsa setelah tidak aktif selama beberapa waktu. | Masuk lagi. |
| `INVALID_PASSWORD` | 401 | Kata sandi saat ini salah pada pergantian kata sandi. | Minta kata sandi saat ini dari pengguna. |
| `PASSWORD_CHANGED` | 409 | Kata sandi diubah di sesi lain, atau diatur ulang oleh administrator, saat permintaan ini berjalan. | Masuk lagi. |
| `OIDC_NO_PASSWORD` | 400 | Pergantian atau pengaturan ulang kata sandi diminta untuk akun yang dibuat melalui SSO. | Arahkan pengguna ke penyedia identitas. |

## OIDC {#oidc-codes}

Kegagalan OIDC saat masuk tidak mengembalikan isi JSON. Rute login mengalihkan ke halaman login dengan alasan umum, dan log audit mencatat kodenya. Rute logout tetap mengakhiri sesi lokal ketika penyedia identitas tidak dapat dijangkau.

| `code` | Status | Arti | Yang perlu dilakukan |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Tidak ada (pengalihan) | URL issuer adalah `http`, tetapi `EXTERNAL_URL` adalah `https`, sehingga klien menolak discovery. | Administrator: sajikan issuer melalui `https`, atau jalankan instance melalui `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Tidak ada (pengalihan) | Discovery issuer melewati batas waktu. | Pastikan server dapat menjangkau issuer, lalu coba lagi. |
| `OIDC_DISCOVERY_FAILED` | Tidak ada (pengalihan) | Discovery gagal karena alasan lain. | Periksa URL issuer dan akses keluar server. |
| `OIDC_END_SESSION_INVALID` | Tidak ada (logout berlanjut) | `end_session_endpoint` penyedia identitas bukan URL yang valid. Sesi lokal tetap dibersihkan. | Administrator: perbaiki metadata penyedia. |
| `OIDC_END_SESSION_SCHEME` | Tidak ada (logout berlanjut) | `end_session_endpoint` menggunakan skema yang tidak diizinkan server. Sesi lokal tetap dibersihkan. | Administrator: perbaiki metadata penyedia. |

## SAML {#saml-codes}

Kegagalan SAML tidak menetapkan `code`. Assertion yang gagal mengalihkan ke halaman login dengan `saml_auth_failed`, dan event audit `SAML_LOGIN_FAILED` mencatat alasannya.

## SCIM {#scim-codes}

Rute SCIM menjawab dengan amplop error RFC 7644 (`schemas`, `detail`, `status`, dan terkadang `scimType`). Rute ini tidak menetapkan `code`. Lakukan percabangan berdasarkan status HTTP.

## Tim, peran, dan pengguna {#team-role-codes}

Nama tim atau peran yang duplikat mengembalikan `CONFLICT` umum, dan tim atau peran yang tidak ada mengembalikan `NOT_FOUND`.

| `code` | Status | Arti | Yang perlu dilakukan |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | Peran pemanggil tidak mengizinkan perubahan ini. Target berada di atas wewenang pemanggil, peran tersebut bawaan, atau permintaan memberikan izin yang tidak dimiliki pemanggil. | Jangan coba lagi. Minta pengguna dengan wewenang lebih tinggi. |
| `UNKNOWN_ROLE` | 400 | ID peran tidak cocok dengan peran yang ada. | Perbaiki ID peran. Daftar peran untuk menemukannya. |
| `UNKNOWN_TEAM` | 400 | ID tim tidak cocok dengan tim yang ada. | Perbaiki ID tim. |
| `SELF_DEMOTE` | 400 | Seorang admin mencoba menghapus peran admin miliknya sendiri. | Minta admin lain melakukan perubahan ini. |
| `SELF_DELETE` | 400 | Seorang admin mencoba menghapus akunnya sendiri. | Minta admin lain menghapusnya. |
| `LAST_ADMIN` | 400 pada rute pengguna, 409 pada rute purge GDPR | Perubahan ini akan membuat tidak ada admin yang tersisa, atau menghapus permanen tim yang berisi semua admin. | Jadikan pengguna lain sebagai admin terlebih dahulu. |
| `USER_LIMIT_REACHED` | 403 | Instance telah mencapai batas `MAX_USERS`. | Hapus seorang pengguna, atau naikkan `MAX_USERS`. |

## Fitur dan bundel AI {#feature-codes}

Alat, batch, dan pipeline yang memerlukan bundel AI opsional menggunakan kode-kode ini.

| `code` | Status | Arti | Yang perlu dilakukan |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501 | Alat, atau satu langkah dari pipeline atau batch, memerlukan bundel yang belum terpasang. Isi respons menyertakan `feature` (ID bundel) dan `featureName`. | Pasang bundel di Pengaturan, lalu coba lagi. |
| `FEATURE_INCOMPATIBLE` | 501 | Fitur yang terpasang tidak dapat menangani kualitas atau bahasa yang diminta. | Ubah pengaturan, atau pasang bundel yang mendukungnya. |
| `ENGINE_UNAVAILABLE` | 503 | Engine yang diperlukan tidak dapat dijalankan, atau runtime OCR dihapus setelah permintaan divalidasi. | Coba lagi setelah administrator memperbaiki atau memasang ulang fitur tersebut. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium belum terpasang, sehingga HTML ke gambar tidak dapat berjalan. | Minta administrator memasang browser tersebut. |
| `BROWSER_CRASHED` | 503 | Browser untuk tangkapan layar mengalami crash saat merender. | Coba permintaan lagi. |

## Alat {#tool-codes}

| `code` | Status | Arti | Yang perlu dilakukan |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | Input yang diunggah dihapus sebelum job berjalan. | Unggah file lagi lalu kirim job. |
| `ANALYSIS_EXPIRED` | 410 | Analisis foto paspor kedaluwarsa sebelum pembuatan. | Analisis foto lagi, lalu buat. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | Hasil penghapusan latar belakang kedaluwarsa sebelum langkah lanjutan. | Hapus latar belakang lagi. |
| `NOT_ANIMATED` | 400 | Hapus Latar Belakang GIF menerima gambar diam. | Gunakan Hapus Latar Belakang untuk gambar diam. |
| `TOO_MANY_FRAMES` | 400 | Animasi memiliki lebih banyak frame daripada yang diizinkan server (`GIF_BG_MAX_FRAMES`). | Kirim animasi yang lebih pendek, atau minta administrator menaikkan batasnya. |

## File {#file-codes}

| `code` | Status | Arti | Yang perlu dilakukan |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Menyimpan ke File akan melebihi kuota penyimpanan pengguna. | Hapus file, atau minta ruang tambahan kepada administrator. |
| `INVALID_STORED_NAME` | 400 | Server menolak nama file yang tersimpan. | Unggah file lagi. |

## Pipeline dan batch {#pipeline-codes}

Permintaan pipeline dan batch mengembalikan kode fitur di atas untuk setiap langkah yang memerlukan bundel. ID job yang sudah digunakan mengembalikan `CONFLICT` dengan status 409. Kirim ID job yang baru.

## Pengaturan {#settings-codes}

| `code` | Status | Arti | Yang perlu dilakukan |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | Kunci ini bukan pengaturan yang dikenal. | Periksa nama kunci. |
| `READONLY_SETTING` | 400 | Pengaturan ini tidak dapat diubah melalui API. | Ubah melalui environment atau UI admin. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | Nilai baru bertentangan dengan pengaturan lain. Isi respons menyebutkan pengaturan di `setting` dan mencantumkan masalahnya di `validationErrors`. | Perbaiki pengaturan yang tercantum, lalu coba lagi. |
| `SETTING_DECRYPTION_FAILED` | 500 | Pengaturan yang tersimpan tidak dapat didekripsi. | Tindakan operator, seperti pada `DECRYPTION_FAILED`. |

Untuk `VALIDATION_ERROR` pada sebuah pengaturan, `details` berisi masalah skema.

## Enterprise {#enterprise-codes}

| `code` | Status | Arti | Yang perlu dilakukan |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | Pengaturan atau kebijakan ini memerlukan lisensi enterprise, seperti penegakan SSO atau kebijakan MFA. | Gunakan instance berlisensi, atau biarkan pengaturan tetap nonaktif. |
| `IP_NOT_ALLOWED` | 403 | Alamat IP permintaan tidak ada dalam allowlist. | Sambungkan dari jaringan yang diizinkan. |
| `INVALID_CIDR` | 400 | Entri allowlist bukan CIDR yang valid. Pesan mencantumkan entri yang salah. | Perbaiki entri lalu simpan lagi. |
| `SELF_LOCKOUT` | 400 | Menyimpan allowlist akan memblokir IP pemanggil saat ini. | Tambahkan IP Anda saat ini ke daftar terlebih dahulu. |

Rute purge GDPR mengembalikan `CONFLICT` biasa dengan status 409 ketika pengguna atau tim berada di bawah legal hold.

## Kode yang tidak diterima klien {#internal-codes}

Kode-kode ini ada di sumber server untuk log, telemetri, atau error milik Fastify sendiri. Klien tidak menerimanya dalam isi respons atau baris job, jadi jangan menulis logika klien berdasarkan kode-kode ini.

| `code` | Ke mana kode ini pergi |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Dilaporkan ke pelacakan error oleh evaluator alert. Header autentikasi webhook alert tidak dapat didekripsi. |
| `SIEM_DECRYPTION_FAILED` | Dilaporkan ke pelacakan error oleh penerusan SIEM. Header autentikasi SIEM tidak dapat didekripsi. |
| `WEBHOOK_DECRYPTION_FAILED` | Dilaporkan ke pelacakan error. Permintaan yang mengalami kegagalan yang sama dijawab dengan `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Dilaporkan ke pelacakan error ketika unggahan yang di-stage tidak dapat dihapus. |
| `USERNAME_RACE_EXHAUSTED` | Dimunculkan ketika pembuatan otomatis SSO kalah dalam balapan nama pengguna pada setiap percobaan ulang. Halaman login menampilkan error sebagai gantinya. |
| `ERR_OUT_OF_RANGE` | Dilempar oleh pembaca object storage untuk rentang byte yang tidak valid. |
| `ETIMEDOUT` | Ditetapkan pada error timeout untuk ekspor GDPR. Ekspor gagal, dan dapat diminta lagi. |
| `FST_REQ_FILE_TOO_LARGE` | Kode Fastify untuk unggahan yang melebihi batas. Klien mendapat 413 dengan `PAYLOAD_TOO_LARGE`, atau pesan 413 milik rute itu sendiri. |
| `TARGET_SIZE_EXCEEDED` | Dilempar ketika kompresi ukuran target tidak mencapai targetnya. Error ini tidak memiliki status atau kode, jadi klien mendapat kegagalan generik. |
