---
title: "Kode error"
description: "Bentuk isi error, kode-kode yang stabil, dan apa yang perlu dilakukan untuk masing-masing kode."
i18n_source_hash: dd2420de1d32
i18n_provenance: machine
i18n_output_hash: e4408df0bb9f
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

Job yang gagal hanya menyimpan `error.code` ketika kegagalannya berupa error input atau kesalahan server. Kegagalan lainnya hanya membawa pesan.

| `code` | Arti | Yang perlu dilakukan |
|--------|---------|------------|
| `CANCELED` | Job dibatalkan oleh pengguna. Ini bukan status HTTP. Event progres membawa `phase: failed` dengan kode ini. | Perlakukan sebagai pembatalan oleh pengguna. Jangan coba ulang secara otomatis. |
| `INPUT_MISSING` | Input dihapus sebelum job berjalan. | Unggah file lagi. |
| `ENGINE_UNAVAILABLE` | Engine yang diperlukan tidak dapat dijalankan di server. | Coba lagi setelah administrator memperbaiki instalasi. |
| `JOB_STALLED` | Tidak dikembalikan ke klien; ini adalah label untuk laporan error server. Worker kehilangan kunci job lebih sering daripada yang diizinkan antrean, biasanya karena server dimulai ulang atau kehabisan memori atau CPU. Job gagal dengan pesan yang menyatakan job terganggu. | Coba lagi. Jika terus terjadi, beri server lebih banyak memori atau turunkan `CONCURRENT_JOBS`. |

## Autentikasi dan MFA {#mfa-codes}

| `code` | Status | Arti | Yang perlu dilakukan |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | Kebijakan MFA mewajibkan pendaftaran, dan instans ini tidak dapat mendaftarkan pengguna (tanpa lisensi enterprise). Instans berlisensi mengembalikan 200 dengan `requiresMfaEnrollment: true` dan memandu pengguna melalui proses pendaftaran. | Jangan coba lagi. Administrator harus mengubah kebijakan atau menggunakan CLI pemulihan offline. |
| `MFA_POLICY_UNAVAILABLE` | 503 | Server tidak dapat membaca kebijakan MFA saat masuk. | Coba masuk lagi sebentar lagi. |
| `INVALID_CODE` | 401 | Kode TOTP atau kode pemulihan salah. | Minta kode baru kepada pengguna lalu coba lagi. Kegagalan berulang berakhir dengan `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Terlalu banyak kode yang salah. Tantangan dibuang. | Mulai proses masuk lagi untuk mendapatkan tantangan baru. |
| `MFA_EXPIRED` | 401 | Tantangan MFA atau pendaftaran sudah kedaluwarsa atau tidak cocok. | Mulai proses masuk lagi. |
| `MFA_NOT_CONFIGURED` | 401 | Akun tidak memiliki secret TOTP, sehingga kode tidak dapat diperiksa. | Daftarkan MFA sebelum masuk dengan kode. |
| `MFA_ALREADY_ENABLED` | 409 | MFA sudah aktif pada akun. | Jangan mendaftar lagi. |
| `NO_PENDING_ENROLLMENT` | 400 | Konfirmasi pendaftaran diterima tanpa pendaftaran yang tertunda. | Panggil endpoint pendaftaran terlebih dahulu. |
| `MFA_NOT_ENABLED` | 400 | Tindakan ini memerlukan MFA aktif, dan MFA nonaktif untuk pengguna ini. | Lewati tindakan tersebut, atau aktifkan MFA terlebih dahulu. |
| `MFA_DECRYPTION_FAILED` | 500 | Secret TOTP yang tersimpan tidak dapat didekripsi. | Tindakan operator. Ini biasanya berarti kunci enkripsi berubah. Periksa `DATA_ENCRYPTION_KEY` dan `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Nilai yang tersimpan (pengaturan, header autentikasi webhook, atau secret TOTP) tidak dapat didekripsi. | Tindakan operator, seperti di atas. Jangan coba lagi. |
| `IDLE_TIMEOUT` | 401 | Sesi kedaluwarsa setelah tidak aktif selama beberapa waktu. | Masuk lagi. |
| `INVALID_PASSWORD` | 401 | Kata sandi saat ini salah pada penggantian kata sandi. | Minta kata sandi saat ini kepada pengguna. |
| `PASSWORD_CHANGED` | 409 | Kata sandi diganti di sesi lain, atau direset oleh administrator, saat permintaan ini berjalan. | Masuk lagi. |
| `OIDC_NO_PASSWORD` | 400 | Penggantian atau reset kata sandi diminta untuk akun yang dibuat melalui SSO. | Arahkan pengguna ke penyedia identitas. |

## OIDC {#oidc-codes}

Kegagalan OIDC saat masuk tidak mengembalikan isi JSON. Rute login mengalihkan ke halaman login dengan alasan umum, dan log audit mencatat kodenya. Rute logout tetap mengakhiri sesi lokal ketika penyedia identitas tidak dapat dijangkau.

| `code` | Status | Arti | Yang perlu dilakukan |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Tidak ada (pengalihan) | URL issuer adalah `http`, tetapi `EXTERNAL_URL` adalah `https`, sehingga klien menolak discovery. | Administrator: sajikan issuer melalui `https`, atau jalankan instans melalui `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Tidak ada (pengalihan) | Discovery issuer melewati batas waktu. | Pastikan server dapat menjangkau issuer, lalu coba lagi. |
| `OIDC_DISCOVERY_FAILED` | Tidak ada (pengalihan) | Discovery gagal karena alasan lain. | Periksa URL issuer dan akses keluar server. |
| `OIDC_END_SESSION_INVALID` | Tidak ada (logout berlanjut) | `end_session_endpoint` milik penyedia identitas bukan URL yang valid. Sesi lokal tetap dihapus. | Administrator: perbaiki metadata penyedia. |
| `OIDC_END_SESSION_SCHEME` | Tidak ada (logout berlanjut) | `end_session_endpoint` menggunakan skema yang tidak diizinkan server. Sesi lokal tetap dihapus. | Administrator: perbaiki metadata penyedia. |

## SAML {#saml-codes}

Kegagalan SAML tidak menetapkan `code`. Assertion yang gagal dialihkan ke halaman login dengan `saml_auth_failed`, dan event audit `SAML_LOGIN_FAILED` mencatat alasannya.

## SCIM {#scim-codes}

Rute SCIM menjawab dengan envelope error RFC 7644 (`schemas`, `detail`, `status`, dan kadang-kadang `scimType`). Rute ini tidak menetapkan `code`. Gunakan status HTTP untuk percabangan logika.

## Tim, peran, dan pengguna {#team-role-codes}

Nama tim atau peran yang duplikat mengembalikan `CONFLICT` yang umum, dan tim atau peran yang tidak ditemukan mengembalikan `NOT_FOUND`.

| `code` | Status | Arti | Yang perlu dilakukan |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | Peran pemanggil tidak mengizinkan perubahan ini. Target berada di atas otoritas pemanggil, peran tersebut bawaan, atau permintaan memberikan izin yang tidak dimiliki pemanggil. | Jangan coba lagi. Minta pengguna dengan otoritas lebih tinggi. |
| `UNKNOWN_ROLE` | 400 | ID peran tidak cocok dengan peran yang ada. | Perbaiki ID peran. Daftar peran untuk menemukannya. |
| `UNKNOWN_TEAM` | 400 | ID tim tidak cocok dengan tim yang ada. | Perbaiki ID tim. |
| `SELF_DEMOTE` | 400 | Admin mencoba menghapus peran admin miliknya sendiri. | Minta admin lain melakukan perubahan ini. |
| `SELF_DELETE` | 400 | Admin mencoba menghapus akunnya sendiri. | Minta admin lain menghapusnya. |
| `LAST_ADMIN` | 400 pada rute pengguna, 409 pada rute purge GDPR | Perubahan ini akan menyisakan nol admin, atau membersihkan tim yang berisi semua admin. | Jadikan pengguna lain sebagai admin terlebih dahulu. |
| `USER_LIMIT_REACHED` | 403 | Instans telah mencapai batas `MAX_USERS`. | Hapus pengguna, atau naikkan `MAX_USERS`. |

## Fitur dan bundel AI {#feature-codes}

Alat, proses batch, dan pipeline yang memerlukan bundel AI opsional menggunakan kode-kode ini.

| `code` | Status | Arti | Yang perlu dilakukan |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501, atau 400 dari mode wajah Smart Crop | Alat, atau satu langkah dari pipeline atau batch, memerlukan bundel yang belum terpasang. Isi respons menyertakan `feature` (ID bundel) dan `featureName`. | Pasang bundel di Pengaturan, lalu coba lagi. |
| `FEATURE_CPU_UNSUPPORTED` | 409 | Pemasangan atau impor offline ditolak karena pustaka x86-64 milik bundel memerlukan AVX dan CPU server ini tidak memilikinya. Tidak ada yang diunduh atau dipasang. Isi respons menyertakan `feature` (ID bundel) dan `reason` (`cpu-no-avx`). `GET /api/v1/features` melaporkan bundel yang sama dengan `compatibility: "incompatible"` dan `compatibilityReason: "cpu-no-avx"`. | Jalankan SnapOtter di CPU dengan AVX, atau di arm64. Bundel lain tetap dapat dipasang. |
| `FEATURE_INCOMPATIBLE` | 501, atau 400 saat Fast OCR mendapat bahasa yang tidak dapat dibacanya | Fitur yang terpasang tidak dapat menangani kualitas atau bahasa yang diminta. | Ubah pengaturan, atau pasang bundel yang mendukungnya. |
| `ENGINE_UNAVAILABLE` | 503 | Engine yang diperlukan tidak dapat dijalankan, atau runtime OCR dihapus setelah permintaan divalidasi. | Coba lagi setelah administrator memperbaiki atau memasang ulang fitur. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium belum terpasang, sehingga HTML ke gambar tidak dapat berjalan. | Minta administrator memasang browser tersebut. |
| `BROWSER_CRASHED` | 503 | Browser tangkapan layar mengalami crash saat merender. | Ulangi permintaan. |

## Alat {#tool-codes}

| `code` | Status | Arti | Yang perlu dilakukan |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | Input yang diunggah dihapus sebelum job berjalan. | Unggah file lagi lalu kirim job. |
| `ANALYSIS_EXPIRED` | 410 | Analisis foto paspor kedaluwarsa sebelum pembuatan. | Analisis foto lagi, lalu buat. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | Hasil penghapusan latar belakang kedaluwarsa sebelum langkah lanjutan. | Hapus latar belakang lagi. |
| `NOT_ANIMATED` | 400 | Remove GIF Background menerima gambar diam. | Gunakan Remove Background untuk gambar diam. |
| `TOO_MANY_FRAMES` | 400 | Animasi memiliki lebih banyak frame daripada yang diizinkan server (`GIF_BG_MAX_FRAMES`). | Kirim animasi yang lebih pendek, atau minta administrator menaikkan batasnya. |
| `TOO_MANY_PIXELS` | 400 | Kanvas animasi dikalikan jumlah frame melebihi batas server: 268.402.689 piksel (16383 x 16383) untuk Remove GIF Background, atau batas beban kerja GIF untuk alat animasi lainnya. | Kirim lebih sedikit frame atau animasi yang lebih kecil. |
| `IMAGE_TOO_LARGE` | 400 | Gambar memiliki lebih banyak piksel daripada yang diterima decoder. | Kirim gambar yang lebih kecil. |
| `RESULT_TOO_LARGE` | 400 | Pengaturan tersebut akan menghasilkan gambar yang lebih besar daripada yang diizinkan batas encoder atau piksel. | Gunakan gambar yang lebih kecil atau pengaturan yang menghasilkan hasil lebih kecil. |
| `DOCUMENT_UNREADABLE` | 400 | LibreOffice atau pandoc tidak dapat membuka dokumen. Dokumen mungkin rusak, dilindungi kata sandi, atau bukan format yang disebutkan ekstensinya. | Pastikan file dapat dibuka di aplikasi office, lalu kirim lagi. |
| `PDF_DAMAGED` | 400 | Engine PDF menemukan struktur dokumen yang rusak. | Jalankan file melalui Repair PDF, lalu coba lagi. |
| `PDF_PASSWORD_PROTECTED` | 400 | PDF terenkripsi dan alat ini tidak dapat membukanya. | Buka kuncinya dengan Unlock PDF terlebih dahulu. |
| `NO_AUDIO_TRACK` | 400 | File tidak memiliki aliran audio yang dapat digunakan alat audio. | Kirim file yang memiliki audio. |
| `MEDIA_UNDECODABLE` | 400 | ffmpeg tidak dapat membaca audio atau video: tidak menemukan paket, parameter codec, atom `moov`, atau data yang dapat diurai. | Pastikan file dapat diputar di pemutar media, atau ekspor ulang, lalu coba lagi. |
| `PAGE_OUT_OF_RANGE` | 400 | Rentang halaman menyebut halaman yang tidak dimiliki PDF. | Periksa jumlah halaman dan kirim rentang di dalamnya. |
| `INVALID_PAGE_RANGE` | 400 | Rentang halaman bukan sintaks yang valid. | Gunakan nomor halaman seperti `1-3,5`. |
| `CANNOT_REMOVE_ALL_PAGES` | 400 | Remove Pages diminta menghapus semua halaman. | Sisakan setidaknya satu halaman. |
| `NESTING_TOO_DEEP` | 400 | JSON atau XML bersarang lebih dari 100 tingkat. | Ratakan dokumen, lalu konversi. |
| `IMAGE_UNDECODABLE` | 400 | Gambar tidak dapat didekode, atau dimensinya tidak dapat dibaca. File mungkin rusak atau menggunakan encoding yang tidak didukung decoder. | Ekspor ulang gambar dari aplikasi lain, atau konversi ke PNG atau JPEG terlebih dahulu. |
| `INVALID_SETTINGS` | 400 | Sebuah pengaturan di luar rentang atau tidak cocok dengan file ini: pemotongan di luar gambar, perubahan ukuran menjadi nol, frame GIF yang tidak ada pada animasi, spesifikasi paspor yang tidak ada. Teks `error` menyebutkan pengaturannya. | Perbaiki pengaturan yang disebutkan di `error`, lalu coba lagi. |
| `CHART_DATA_INVALID` | 400 | Chart Maker tidak dapat membaca data grafik dari file: CSV atau JSON tidak dapat di-parse, tidak memiliki kolom numerik, memiliki lebih dari 100 baris, atau memiliki nilai negatif. Teks `error` menjelaskan yang mana. | Kirim CSV atau JSON dengan hingga 100 baris, masing-masing berisi label dan angka nol atau lebih. |
| `NO_FACE_DETECTED` | 400 | Passport Photo tidak menemukan wajah pada gambar. | Kirim foto yang jelas, menghadap ke depan, dengan pencahayaan yang baik. |
| `TARGET_SIZE_UNREACHABLE` | 400 | Kompresi, atau batas ukuran foto paspor, tidak dapat membuat file lebih kecil dari ukuran yang diminta, bahkan setelah diperkecil. | Minta ukuran target yang lebih besar, atau potong gambar terlebih dahulu. |
| `TOO_MANY_PAGES` | 400 | OCR diminta memproses lebih banyak halaman daripada yang diproses dalam satu job. | Pilih lebih sedikit halaman dengan rentang halaman. |
| `METADATA_DAMAGED` | 400 | Edit Metadata menemukan data EXIF gambar yang ada rusak, sehingga tidak dapat menulis ulang dengan aman. | Hapus metadata dengan Remove Image Metadata terlebih dahulu, lalu edit. |
| `REMOTE_RESOURCES_DISABLED` | 400 | HTML atau Markdown ke PDF menemukan referensi ke gambar, stylesheet, atau font di jaringan, yang tidak diambil oleh server. | Sematkan sumber daya tersebut di dalam file (misalnya sebagai URI `data:`), lalu coba lagi. |

## File {#file-codes}

| `code` | Status | Arti | Yang perlu dilakukan |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Menyimpan ke Files akan melebihi kuota penyimpanan pengguna. | Hapus file, atau minta ruang tambahan kepada administrator. |
| `INVALID_STORED_NAME` | 400 | Server menolak nama file yang tersimpan. | Unggah file lagi. |

## Pipeline dan batch {#pipeline-codes}

Permintaan pipeline dan batch mengembalikan kode fitur di atas untuk setiap langkah yang memerlukan bundel. ID job yang sudah digunakan mengembalikan `CONFLICT` dengan status 409. Kirim ID job yang baru.

## Pengaturan {#settings-codes}

| `code` | Status | Arti | Yang perlu dilakukan |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | Kunci bukan pengaturan yang dikenal. | Periksa nama kunci. |
| `READONLY_SETTING` | 400 | Pengaturan tidak dapat diubah melalui API. | Ubah melalui environment atau UI admin. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | Nilai baru bertentangan dengan pengaturan lain. Isi respons menyebutkan pengaturan di `setting` dan mencantumkan masalahnya di `validationErrors`. | Perbaiki pengaturan yang tercantum, lalu coba lagi. |
| `SETTING_DECRYPTION_FAILED` | 500 | Pengaturan yang tersimpan tidak dapat didekripsi. | Tindakan operator, seperti untuk `DECRYPTION_FAILED`. |

Untuk `VALIDATION_ERROR` pada sebuah pengaturan, `details` berisi masalah skema.

## Enterprise {#enterprise-codes}

| `code` | Status | Arti | Yang perlu dilakukan |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | Pengaturan atau kebijakan memerlukan lisensi enterprise, seperti penerapan SSO atau kebijakan MFA. | Gunakan instans berlisensi, atau biarkan pengaturan nonaktif. |
| `IP_NOT_ALLOWED` | 403 | Alamat IP permintaan tidak ada dalam allowlist. | Hubungkan dari jaringan yang diizinkan. |
| `INVALID_CIDR` | 400 | Entri allowlist bukan CIDR yang valid. Pesan mencantumkan entri yang salah. | Perbaiki entri lalu simpan lagi. |
| `SELF_LOCKOUT` | 400 | Menyimpan allowlist akan memblokir IP pemanggil saat ini. | Tambahkan IP Anda saat ini ke daftar terlebih dahulu. |

Rute purge GDPR mengembalikan `CONFLICT` biasa dengan status 409 ketika pengguna atau tim berada di bawah legal hold.

## Kode yang tidak diterima klien {#internal-codes}

Kode-kode ini ada di kode sumber server untuk log, telemetri, atau error milik Fastify sendiri. Klien tidak menerimanya di isi respons atau baris job, jadi jangan tulis logika klien berdasarkan kode-kode ini.

| `code` | Tujuannya |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Dilaporkan ke pelacakan error oleh evaluator alert. Header autentikasi webhook alert tidak dapat didekripsi. |
| `SIEM_DECRYPTION_FAILED` | Dilaporkan ke pelacakan error oleh penerusan SIEM. Header autentikasi SIEM tidak dapat didekripsi. |
| `WEBHOOK_DECRYPTION_FAILED` | Dilaporkan ke pelacakan error. Permintaan yang mengalami kegagalan yang sama dijawab dengan `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Dilaporkan ke pelacakan error ketika unggahan yang di-stage tidak dapat dihapus. |
| `USERNAME_RACE_EXHAUSTED` | Dimunculkan ketika pembuatan otomatis SSO kalah dalam perebutan username pada setiap percobaan ulang. Halaman login menampilkan error sebagai gantinya. |
| `ERR_OUT_OF_RANGE` | Dilempar oleh pembaca object storage untuk rentang byte yang tidak valid. |
| `ETIMEDOUT` | Ditetapkan pada error timeout untuk ekspor GDPR. Ekspor gagal, dan dapat diminta lagi. |
| `FST_REQ_FILE_TOO_LARGE` | Kode Fastify untuk unggahan yang melebihi batas. Klien mendapat 413 dengan `PAYLOAD_TOO_LARGE`, atau pesan 413 milik rute itu sendiri. |
| `TARGET_SIZE_EXCEEDED` | Dilempar ketika kompresi ukuran target tidak mencapai targetnya. Error ini tidak memiliki status atau kode, jadi klien mendapat kegagalan generik. |
| `OCR_CACHE_PERMISSIONS` | Dilaporkan ke pelacakan error sebagai kesalahan operasional ketika volume data AI membuat cache runtime OCR dapat ditulis oleh semua pengguna. Job instalasi gagal dengan pesan yang menyebutkan masalah penyimpanan. |
| `OCR_RUNTIME_UNREACHABLE` | Dilaporkan ke pelacakan error sebagai kesalahan operasional ketika server tidak pernah menjangkau huggingface.co untuk mengunduh runtime OCR. Job instalasi gagal dengan pesan tentang akses jaringan, `HTTPS_PROXY`, dan impor offline. |
