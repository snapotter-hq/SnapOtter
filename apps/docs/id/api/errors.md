---
title: "Kode error"
description: "Bentuk isi error, kode-kode yang stabil, dan apa yang perlu dilakukan untuk masing-masing kode."
i18n_source_hash: d4ea74165166
i18n_provenance: machine
i18n_output_hash: 064d794e5c7f
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

## Belum dikatalogkan {#not-yet-cataloged}

Kode yang dimunculkan oleh masing-masing fitur (misalnya enkripsi, OIDC, SCIM, dan tim) belum dijelaskan di halaman ini. Setiap kode bersifat stabil; perlakukan kode yang tidak terdaftar sebagai opak dan tangani berdasarkan statusnya.
