---
description: "Siapkan Single Sign-On dengan OpenID Connect. Panduan langkah demi langkah untuk Keycloak, Authentik, Google, Microsoft Entra ID (Azure AD), Okta, dan penyedia OIDC lainnya."
i18n_source_hash: 438fff2ba4c6
i18n_provenance: human
i18n_output_hash: 5e6d2a00ca73
---

# OIDC / Single Sign-On {#oidc-single-sign-on}

SnapOtter mendukung OpenID Connect (OIDC) untuk single sign-on. Pengguna dapat login dengan penyedia identitas eksternal seperti Keycloak, Authentik, Google, atau Microsoft Entra ID alih-alih (atau bersama) autentikasi username/kata sandi lokal.

::: tip Lihat juga
[SAML SSO](/id/guide/saml) | [Provisioning SCIM](/id/guide/scim) | [Pengguna, Peran & Izin](/id/guide/users-roles)
:::

## Mulai cepat {#quick-start}

Tambahkan variabel lingkungan ini ke `docker-compose.yml` Anda:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

Redirect URI untuk penyedia Anda selalu:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

Misalnya, jika `EXTERNAL_URL` adalah `https://photos.example.com`, konfigurasikan redirect URI penyedia Anda sebagai `https://photos.example.com/api/auth/oidc/callback`.

## Referensi konfigurasi {#configuration-reference}

| Variabel | Default | Deskripsi |
|---|---|---|
| `OIDC_ENABLED` | `false` | Aktifkan login OIDC. Tombol "Sign in with SSO" muncul di halaman login. |
| `OIDC_ISSUER_URL` | | URL issuer penyedia. Harus mendukung OIDC Discovery (`/.well-known/openid-configuration`). |
| `OIDC_CLIENT_ID` | | Client ID OAuth yang terdaftar dengan penyedia Anda. |
| `OIDC_CLIENT_SECRET` | | Client secret OAuth. |
| `OIDC_SCOPES` | `openid profile email` | Daftar scope yang diminta, dipisahkan spasi. |
| `OIDC_AUTO_CREATE_USERS` | `true` | Buat akun pengguna lokal secara otomatis saat login OIDC pertama. |
| `OIDC_DEFAULT_ROLE` | `user` | Peran yang diberikan ke pengguna OIDC yang dibuat otomatis. Salah satu dari `admin`, `editor`, atau `user`. |
| `OIDC_AUTO_LINK_USERS` | `false` | Tautkan identitas OIDC ke pengguna lokal yang ada jika alamat email cocok. |
| `OIDC_PROVIDER_NAME` | | Nama tampilan yang ditunjukkan pada tombol login (mis. "Keycloak", "Google"). Jika kosong, tombol bertuliskan "SSO". |
| `OIDC_CLOCK_TOLERANCE` | `30` | Toleransi selisih jam dalam detik untuk validasi token. |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | Klaim ID token yang digunakan sebagai username untuk akun baru. |
| `EXTERNAL_URL` | | URL publik tempat SnapOtter dapat dijangkau. Diperlukan agar OIDC membangun redirect URI yang benar. |
| `COOKIE_SECRET` | dihasilkan otomatis | Secret untuk menandatangani cookie sesi. Setel ini secara eksplisit saat menjalankan beberapa replika. |

## Panduan penyedia {#provider-guides}

### Keycloak {#keycloak}

1. Buat realm baru (atau gunakan yang sudah ada).
2. Buka **Clients** dan buat client baru:
   - **Client ID**: `snapotter`
   - **Client authentication**: On (confidential)
   - **Authentication flow**: Standard flow (Authorization Code)
3. Di bawah tab **Settings** client, setel **Valid redirect URIs** ke URL callback Anda (mis. `https://photos.example.com/api/auth/oidc/callback`).
4. Salin **Client secret** dari tab **Credentials**.
5. Setel `OIDC_ISSUER_URL` ke `https://keycloak.example.com/realms/your-realm`.

### Authentik {#authentik}

1. Di antarmuka admin, buka **Applications > Providers** dan buat **OAuth2/OpenID Provider** baru.
   - **Client type**: Confidential
   - **Redirect URIs**: URL callback Anda
   - **Signing key**: Pilih key yang ada atau buat satu
2. Buat sebuah **Application** dan tautkan ke penyedia.
3. Salin **Client ID** dan **Client Secret** dari pengaturan penyedia.
4. Setel `OIDC_ISSUER_URL` ke `https://authentik.example.com/application/o/snapotter/` (garis miring di akhir penting).

### Google {#google}

1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Buat proyek (atau pilih yang sudah ada).
3. Navigasi ke **APIs & Services > OAuth consent screen** dan konfigurasikan.
4. Buka **APIs & Services > Credentials** dan buat **OAuth 2.0 Client ID**:
   - **Application type**: Web application
   - **Authorized redirect URIs**: URL callback Anda
5. Salin **Client ID** dan **Client secret**.
6. Setel `OIDC_ISSUER_URL` ke `https://accounts.google.com`.
7. Setel `OIDC_USERNAME_CLAIM` ke `email` (Google tidak menyediakan `preferred_username`).

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Di portal Azure, buka **Microsoft Entra ID > App registrations > New registration**.
2. Beri nama aplikasi "SnapOtter". Di bawah **Redirect URI**, pilih platform **Web** dan masukkan URL callback Anda (mis. `https://photos.example.com/api/auth/oidc/callback`). Jangan pilih **Single-page application**: SnapOtter melakukan autentikasi dengan client secret, yang ditolak Entra ID pada registrasi SPA.
3. Salin **Application (client) ID** dan **Directory (tenant) ID** dari halaman **Overview**.
4. Buka **Certificates & secrets > New client secret** dan segera salin **Value** dari secret tersebut. Nilai ini hanya ditampilkan sekali, dan Secret ID di sebelahnya bukanlah secret-nya.
5. Setel `OIDC_ISSUER_URL` ke `https://login.microsoftonline.com/<tenant-id>/v2.0`, menggunakan Directory (tenant) ID dari langkah 3.
6. Biarkan `OIDC_USERNAME_CLAIM` pada nilai default-nya. Entra ID menyediakan `preferred_username`, jadi override `email` dari panduan Google tidak diperlukan di sini.

Selalu gunakan tenant ID Anda di URL issuer, bukan `common` atau `organizations`. Endpoint multi-tenant tersebut mengiklankan templat literal `{tenantid}` sebagai issuer-nya, yang gagal dalam validasi OIDC discovery.

::: warning
`preferred_username` di Entra ID mengikuti user principal name, yang berubah saat pengguna diganti namanya atau dipindahkan ke tenant lain. SnapOtter membaca klaim ini sekali, saat login pertama, sehingga akun tetap memakai username aslinya setelah itu. Apa pun kondisinya, login tetap berfungsi: pengguna yang kembali dicocokkan berdasarkan subject stabil dari token, bukan berdasarkan username.
:::

Beralih ke Entra ID tidak mematikan login kata sandi. Lihat [Menonaktifkan login lokal](#disabling-local-login).

### Okta dan penyedia lainnya {#okta-and-other-providers}

Penyedia mana pun yang mendukung OIDC Discovery bekerja dengan cara yang sama: buat confidential web client dengan URL callback Anda, lalu arahkan `OIDC_ISSUER_URL` ke issuer. Untuk Okta, buat aplikasi dengan metode sign-in **OIDC - OpenID Connect** dan tipe **Web Application**, lalu gunakan domain Okta Anda sebagai issuer (mis. `https://your-company.okta.com`).

SnapOtter tidak memetakan grup penyedia identitas ke peran. Pengguna SSO baru mendapatkan `OIDC_DEFAULT_ROLE`, admin mengubah peran di **Settings > Users**, dan meminta klaim grup melalui `OIDC_SCOPES` tidak berpengaruh.

## Provisioning pengguna {#user-provisioning}

### Buat otomatis {#auto-create}

Saat `OIDC_AUTO_CREATE_USERS` bernilai `true` (default), akun pengguna lokal dibuat pertama kali seseorang login via OIDC. Username diambil dari klaim yang ditentukan oleh `OIDC_USERNAME_CLAIM`, dan peran disetel ke `OIDC_DEFAULT_ROLE`.

Jika terjadi tabrakan username, sufiks numerik ditambahkan (mis. `jane` menjadi `jane_2`).

### Tautan otomatis {#auto-link}

Saat `OIDC_AUTO_LINK_USERS` bernilai `true`, SnapOtter menautkan identitas OIDC ke akun lokal yang ada jika alamat email cocok. Ini berguna saat Anda telah membuat akun pengguna sebelumnya dan ingin mereka mulai menggunakan SSO tanpa kehilangan data.

::: warning 
Hanya aktifkan tautan otomatis jika Anda memercayai penyedia OIDC Anda untuk memverifikasi alamat email. Email yang tidak terverifikasi dapat memungkinkan seseorang mengambil alih akun pengguna lain.
:::

### Menonaktifkan login lokal {#disabling-local-login}

OIDC tidak menonaktifkan login username/kata sandi lokal. Kedua metode tetap tersedia. Admin masih dapat login dengan kredensial lokal jika penyedia OIDC tidak dapat dijangkau.

## Sertifikat self-signed {#self-signed-certificates}

Jika penyedia OIDC Anda menggunakan sertifikat self-signed atau CA privat, mount CA bundle ke dalam container dan arahkan `NODE_EXTRA_CA_CERTS` ke sana:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - ./my-ca.pem:/etc/ssl/certs/custom-ca.pem:ro
    environment:
      NODE_EXTRA_CA_CERTS: /etc/ssl/certs/custom-ca.pem
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.internal.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

::: danger 
Jangan setel `NODE_TLS_REJECT_UNAUTHORIZED=0`. Ini menonaktifkan semua verifikasi TLS dan merupakan risiko keamanan.
:::

## Pemecahan masalah {#troubleshooting}

### Ketidakcocokan redirect URI {#redirect-uri-mismatch}

Kesalahan paling umum. Periksa perbedaan berikut antara apa yang diharapkan penyedia Anda dan apa yang dikirim SnapOtter:

- `http` vs `https` - skema harus cocok persis
- Garis miring di akhir - beberapa penyedia ketat soal ini
- Nomor port - sertakan port jika non-standar
- Path - harus `/api/auth/oidc/callback`

Periksa ulang `EXTERNAL_URL`. Nilainya harus cocok dengan URL yang diketik pengguna di browser mereka.

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

Penyedia OIDC menggunakan sertifikat yang tidak dipercaya oleh Node.js. Lihat [Sertifikat self-signed](#self-signed-certificates) di atas.

### Kesalahan selisih jam {#clock-skew-errors}

Jika jam server Anda dan jam penyedia OIDC tidak sinkron, validasi token bisa gagal. Naikkan `OIDC_CLOCK_TOLERANCE` (default 30 detik). Perbaikan yang lebih baik adalah menjalankan NTP di kedua mesin.

### "OIDC provider unreachable" {#oidc-provider-unreachable}

SnapOtter mengambil dokumen discovery penyedia saat startup dan selama login. Periksa:

- Resolusi DNS dari dalam container Docker (`docker exec snapotter nslookup auth.example.com`)
- Aturan firewall antara container dan penyedia
- Nilai `OIDC_ISSUER_URL` - harus dapat dijangkau dari server, bukan hanya dari browser Anda

### Klaim hilang {#missing-claims}

Jika username atau email kosong setelah login, penyedia Anda mungkin tidak mengembalikan klaim yang diharapkan. Verifikasi:

- Scope yang dikonfigurasi di `OIDC_SCOPES` menyertakan `profile` dan `email`
- Penyedia dikonfigurasi untuk menyertakan klaim yang ditentukan di `OIDC_USERNAME_CLAIM` dalam ID token
- Beberapa penyedia memerlukan konfigurasi mapper/scope eksplisit untuk merilis klaim
