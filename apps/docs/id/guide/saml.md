---
description: "Siapkan Single Sign-On SAML 2.0 untuk SnapOtter. Panduan langkah demi langkah untuk Okta, Azure AD / Entra ID, Google Workspace, dan penyedia identitas SAML lainnya."
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: becd9d2f8770
---

# SAML SSO {#saml-sso}

SnapOtter mendukung SAML 2.0 untuk single sign-on. Pengguna dapat login via penyedia identitas eksternal (Okta, Azure AD / Entra ID, Google Workspace, atau IdP SAML 2.0 standar apa pun) alih-alih autentikasi username/kata sandi lokal.

::: tip Fitur enterprise
SAML SSO memerlukan lisensi **team** atau **enterprise** dengan fitur `saml_sso`. Jika `SAML_ENABLED=true` disetel tanpa lisensi yang valid, rute SAML dilewati secara diam-diam dan peringatan dicatat.
:::

## Prasyarat {#prerequisites}

- Instance SnapOtter yang berjalan dan dapat dijangkau di URL publik
- `EXTERNAL_URL` disetel ke URL publik itu (mis. `https://photos.example.com`)
- Kunci lisensi team atau enterprise dengan fitur `saml_sso`
- Akses admin ke penyedia identitas SAML Anda

## Mulai cepat {#quick-start}

Tambahkan variabel lingkungan ini ke `docker-compose.yml` Anda:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      SNAPOTTER_LICENSE_KEY: "your-license-key"
      SAML_ENABLED: "true"
      SAML_IDP_SSO_URL: "https://idp.example.com/sso/saml"
      SAML_IDP_CERTIFICATE: |
        MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw
        ...your IdP's signing certificate in PEM format...
        EAYHKoZIzj0CAQYFK4EEACIDYgAE
```

Mulai ulang container. Tombol "Sign in with SAML" (atau label yang disetel oleh `SAML_PROVIDER_NAME`) muncul di halaman login.

## Referensi konfigurasi {#configuration-reference}

| Variabel | Default | Deskripsi |
|---|---|---|
| `SAML_ENABLED` | `false` | Aktifkan login SAML. |
| `SAML_IDP_SSO_URL` | | URL endpoint SSO IdP. **Wajib** saat SAML diaktifkan. |
| `SAML_IDP_CERTIFICATE` | | Sertifikat penandatanganan X.509 IdP dalam format PEM (teks sertifikat itu sendiri, bukan path file). **Wajib** saat SAML diaktifkan. |
| `EXTERNAL_URL` | | URL publik tempat SnapOtter dapat dijangkau. **Wajib** saat SAML diaktifkan. |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | SP Entity ID / Audience URI yang dikirim ke IdP. |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | URL Assertion Consumer Service (ACS). |
| `SAML_AUTO_CREATE_USERS` | `true` | Buat akun pengguna lokal secara otomatis saat login SAML pertama. |
| `SAML_AUTO_LINK_USERS` | `false` | Tautkan identitas SAML ke pengguna lokal yang ada jika alamat email cocok. |
| `SAML_DEFAULT_ROLE` | `user` | Peran yang diberikan ke pengguna SAML yang dibuat otomatis. Salah satu dari `admin`, `editor`, atau `user`. |
| `SAML_PROVIDER_NAME` | | Label tampilan untuk tombol login SAML di frontend (mis. "Okta", "Azure AD"). Jika kosong, tombol bertuliskan "SAML". |
| `SAML_USERNAME_ATTRIBUTE` | | Atribut assertion SAML yang digunakan sebagai username. Jika kosong, kembali ke local-part email, lalu NameID. |
| `SAML_EMAIL_ATTRIBUTE` | `email` | Atribut assertion SAML yang digunakan sebagai alamat email pengguna. |

Server menolak untuk mulai jika `SAML_ENABLED=true` dan salah satu dari tiga variabel yang wajib (`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`) tidak ada.

::: details Catatan keamanan
Baik `wantAuthnResponseSigned` maupun `wantAssertionsSigned` dikodekan tetap (hardcoded) ke `true`. SnapOtter menolak respons SAML yang tidak ditandatangani atau ditandatangani secara tidak benar. Assertion dari IdP tepercaya diperlakukan sebagai email-terverifikasi.

Hanya login yang diinisiasi SP yang didukung. SnapOtter tidak mendukung login yang diinisiasi IdP (tidak diminta) atau Single Logout (SLO). Logout dari SnapOtter tidak membuat pengguna keluar dari IdP.
:::

## Metadata dan URL SP {#sp-metadata-and-urls}

IdP Anda membutuhkan tiga nilai dari SnapOtter:

| Bidang | Nilai |
|---|---|
| **ACS URL** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP Metadata** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

Misalnya, jika `EXTERNAL_URL` adalah `https://photos.example.com`:

- ACS URL: `https://photos.example.com/api/auth/saml/callback`
- Entity ID: `https://photos.example.com/api/auth/saml/metadata`
- Endpoint metadata: `https://photos.example.com/api/auth/saml/metadata` (mengembalikan XML)

Beberapa IdP dapat mengimpor URL metadata SP secara langsung, yang mengisi otomatis ACS URL dan Entity ID.

## Penyiapan penyedia {#provider-setup}

### Okta {#okta}

1. Di konsol admin Okta, buka **Applications > Create App Integration**.
2. Pilih **SAML 2.0** dan klik **Next**.
3. Setel nama (mis. "SnapOtter") dan klik **Next**.
4. Konfigurasikan pengaturan SAML:
   - **Single sign-on URL**: ACS URL Anda (mis. `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: Entity ID Anda (mis. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. Di bawah **Attribute Statements**, tambahkan `email` yang dipetakan ke `user.email`.
6. Klik **Next**, lalu **Finish**.
7. Buka tab **Sign On**, klik **View SAML setup instructions**, dan salin:
   - **Identity Provider Single Sign-On URL** ke `SAML_IDP_SSO_URL`
   - **X.509 Certificate** ke `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Di portal Azure, buka **Microsoft Entra ID > Enterprise applications > New application**.
2. Klik **Create your own application**, beri nama "SnapOtter", dan pilih **Integrate any other application you don't find in the gallery**.
3. Buka **Single sign-on > SAML** dan klik **Edit** pada bagian **Basic SAML Configuration**:
   - **Identifier (Entity ID)**: Entity ID Anda (mis. `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: ACS URL Anda (mis. `https://photos.example.com/api/auth/saml/callback`)
4. Di bawah **SAML Certificates**, unduh **Certificate (Base64)**.
5. Di bawah **Set up SnapOtter**, salin **Login URL**.
6. Setel `SAML_IDP_SSO_URL` ke Login URL dan `SAML_IDP_CERTIFICATE` ke isi sertifikat yang diunduh.
7. Tetapkan pengguna atau grup ke aplikasi di bawah **Users and groups**.

### Google Workspace {#google-workspace}

1. Di konsol Google Admin, buka **Apps > Web and mobile apps > Add app > Add custom SAML app**.
2. Beri nama aplikasi "SnapOtter" dan klik **Continue**.
3. Di halaman **Google Identity Provider details**, salin **SSO URL** dan unduh **Certificate**. Klik **Continue**.
4. Konfigurasikan detail Service Provider:
   - **ACS URL**: ACS URL Anda (mis. `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: Entity ID Anda (mis. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. Klik **Continue**, lalu **Finish**.
6. Aktifkan aplikasi **ON** untuk unit organisasi Anda.
7. Setel `SAML_IDP_SSO_URL` ke SSO URL dari langkah 3 dan `SAML_IDP_CERTIFICATE` ke isi sertifikat yang diunduh.

### IdP SAML 2.0 generik {#generic-saml-2-0-idp}

Untuk penyedia identitas apa pun yang patuh SAML 2.0:

1. Buat aplikasi/service provider SAML baru di IdP Anda.
2. Setel **ACS URL** ke `${EXTERNAL_URL}/api/auth/saml/callback`.
3. Setel **Entity ID** / **Audience** ke `${EXTERNAL_URL}/api/auth/saml/metadata`.
4. Konfigurasikan IdP untuk mengirim email pengguna dalam atribut bernama `email` (atau setel `SAML_EMAIL_ATTRIBUTE` agar cocok dengan nama atribut IdP Anda).
5. Salin **IdP SSO URL** dan **sertifikat penandatanganan** ke `SAML_IDP_SSO_URL` dan `SAML_IDP_CERTIFICATE`.

## Provisioning pengguna {#user-provisioning}

### Buat otomatis {#auto-create}

Saat `SAML_AUTO_CREATE_USERS` bernilai `true` (default), akun pengguna lokal dibuat pertama kali seseorang login via SAML. Peran disetel ke `SAML_DEFAULT_ROLE`.

Username diturunkan dalam urutan ini:

1. Nilai atribut assertion yang ditentukan oleh `SAML_USERNAME_ATTRIBUTE` (jika disetel dan ada)
2. Local-part alamat email (semua yang sebelum `@`)
3. NameID SAML

Jika terjadi tabrakan username, sufiks numerik ditambahkan (mis. `jane` menjadi `jane_2`).

### Tautan otomatis {#auto-link}

Saat `SAML_AUTO_LINK_USERS` bernilai `true`, SnapOtter menautkan identitas SAML ke akun lokal yang ada jika alamat email cocok. Ini berguna saat Anda telah membuat akun pengguna sebelumnya dan ingin mereka mulai menggunakan SSO tanpa kehilangan data.

::: warning 
Hanya aktifkan tautan otomatis jika Anda memercayai IdP SAML Anda untuk memverifikasi alamat email. Email yang tidak terverifikasi dari IdP yang salah konfigurasi dapat memungkinkan seseorang mengambil alih akun pengguna lain.
:::

### Pemetaan atribut {#attribute-mapping}

| Bidang SnapOtter | Sumber | Konfigurasi |
|---|---|---|
| Email | Atribut assertion | `SAML_EMAIL_ATTRIBUTE` (default: `email`) |
| Username | Atribut assertion, email, atau NameID | `SAML_USERNAME_ATTRIBUTE` (lihat urutan penurunan di atas) |
| External ID | NameID | Selalu NameID SAML, tidak dapat dikonfigurasi |

## Penegakan SSO {#sso-enforcement}

Jika Anda ingin mewajibkan semua pengguna login via SAML (atau OIDC) dan memblokir login kata sandi lokal, aktifkan penegakan SSO:

1. Pastikan fitur enterprise `sso_enforcement` dilisensikan (tersedia pada paket team dan enterprise).
2. Di **Admin Settings > Security**, aktifkan **SSO Enforcement**.
3. Setel **break-glass username**: ini adalah satu-satunya akun lokal yang masih dapat login dengan kata sandi, untuk akses darurat jika IdP tidak dapat dijangkau.

Saat penegakan SSO aktif, setiap upaya login lokal (kecuali untuk pengguna break-glass) mengembalikan kesalahan 403 dengan pesan "Local password login is disabled. Please use SSO."

::: tip 
Selalu konfigurasikan break-glass username sebelum mengaktifkan penegakan SSO. Tanpanya, Anda bisa terkunci dari SnapOtter jika IdP Anda mati.
:::

## Menggunakan SAML bersama OIDC {#using-saml-alongside-oidc}

SAML dan OIDC dapat diaktifkan secara bersamaan. Saat keduanya aktif, halaman login menampilkan tombol terpisah untuk setiap penyedia (diberi label oleh `SAML_PROVIDER_NAME` dan `OIDC_PROVIDER_NAME`). Pengguna dapat login dengan metode mana pun.

Kedua penyedia berbagi pengaturan buat-otomatis, tautan-otomatis, dan penegakan SSO yang sama secara independen: masing-masing memiliki variabel `*_AUTO_CREATE_USERS`, `*_AUTO_LINK_USERS`, dan `*_DEFAULT_ROLE` sendiri.

## Pemecahan masalah {#troubleshooting}

### Validasi assertion gagal {#assertion-validation-failed}

Tanda tangan respons SAML atau tanda tangan assertion tidak dapat diverifikasi. Periksa:

- Sertifikat di `SAML_IDP_CERTIFICATE` cocok dengan sertifikat penandatanganan saat ini di IdP Anda (sertifikat berotasi, jadi periksa kedaluwarsa)
- Sertifikat dalam format PEM (dimulai dengan `-----BEGIN CERTIFICATE-----`)
- Sertifikat adalah teks lengkap, bukan path file
- ACS URL dan Entity ID yang dikonfigurasi di IdP Anda cocok persis dengan nilai SnapOtter (skema, host, port, path)

### Atribut hilang {#missing-attributes}

Jika username atau email kosong setelah login, IdP Anda mungkin tidak mengirim atribut yang diharapkan. Periksa:

- IdP Anda dikonfigurasi untuk merilis atribut `email` (atau apa pun yang disetel di `SAML_EMAIL_ATTRIBUTE`)
- Jika menggunakan `SAML_USERNAME_ATTRIBUTE`, verifikasi bahwa atribut itu disertakan dalam assertion
- Beberapa IdP memerlukan konfigurasi pemetaan atribut eksplisit sebelum merilis klaim

### Selisih jam {#clock-skew}

Assertion SAML menyertakan kondisi stempel waktu (`NotBefore`, `NotOnOrAfter`). Jika jam server Anda dan jam IdP tidak sinkron, validasi assertion gagal. Jalankan NTP di kedua mesin untuk menjaga jam tetap selaras.

### "SAML is enabled via env but saml_sso enterprise feature is not licensed" {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

Peringatan ini muncul di log server saat `SAML_ENABLED=true` tetapi lisensi tidak menyertakan fitur `saml_sso`. Verifikasi kunci lisensi dan paket Anda. Fitur `saml_sso` tersedia pada paket team dan enterprise.

### Login mengalihkan kembali dengan kesalahan {#login-redirects-back-with-error}

Jika mengklik tombol login SAML mengalihkan kembali ke halaman login dengan kesalahan, periksa log server untuk detail. Penyebab umum:

- IdP SSO URL tidak dapat dijangkau dari server
- IdP menolak permintaan autentikasi (periksa log audit IdP)
- IdP mengembalikan respons yang tidak ditandatangani (SnapOtter memerlukan baik respons maupun assertion untuk ditandatangani)
