---
i18n_source_hash: f75ca08bcb71
i18n_provenance: machine
i18n_output_hash: 53adc0981a3c
i18n_hash_version: 2
---
# Pemulihan Akun {#account-recovery}

Jika Anda terkunci dari SnapOtter (paling sering karena kebijakan MFA yang tidak
lagi bisa Anda penuhi), Anda dapat memulihkannya dari dalam kontainer tanpa klien
basis data. Perintah pemulihan bersifat offline dan memerlukan akses shell ke
kontainer, yang berarti sudah memiliki kendali penuh atas instans tersebut.

## Dinding mana yang saya hadapi? {#which-wall-am-i-hitting}

Login SnapOtter menerapkan dua gerbang MFA yang independen. Diagnosis dulu:

```bash
docker exec -it snapotter snapotter-admin status
```

Ini mencetak kebijakan MFA saat ini dan pengguna mana yang telah mendaftarkan TOTP.

- **"MFA enrollment is required before login" (dan Anda tidak pernah menyiapkan aplikasi):**
  kebijakan mewajibkan MFA tetapi Anda belum mendaftar. Longgarkan kebijakannya.
- **Anda diminta kode yang tidak bisa Anda hasilkan** (ponsel hilang dan kode
  pemulihan Anda juga hilang): akun Anda terdaftar. Hapus pendaftaran itu.

## Longgarkan kebijakan MFA {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

Ini mengembalikan kebijakan ke `optional`. Berlaku pada login Anda berikutnya tanpa
perlu restart. Ini hanya pernah menetapkan `optional`, sehingga tidak dapat mengaktifkan kembali penegakan.

## Hapus pendaftaran TOTP satu pengguna {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

Jika kebijakan masih mewajibkan MFA untuk pengguna itu, mereka akan menghadapi dinding
pendaftaran berikutnya, jadi jalankan juga `reset-mfa-policy`, login, dan daftar ulang dari Settings.

## Atur ulang kata sandi yang terlupa {#reset-a-forgotten-password}

```bash
docker exec -it snapotter snapotter-admin reset-password <username> [password]
```

Kosongkan `[password]` dan CLI akan mencetak kata sandi sementara yang dibuat otomatis. Dengan cara apa pun, sesi aktif, kunci API, dan jendela pembatasan gagal login pengguna akan dihapus, serta SnapOtter mewajibkan perubahan kata sandi pada login berikutnya.

## Buat akun admin awal {#bootstrap-an-admin-account}

```bash
docker exec -it snapotter snapotter-admin create-admin [username] [password]
```

Gunakan ini saat tidak ada akun admin yang bisa masuk. `[username]` secara default adalah `DEFAULT_USERNAME` (`admin`), dan mengosongkan `[password]` akan mencetak kata sandi sementara yang harus diubah saat login pertama.

## Buka kunci pengguna yang dibatasi atau dinonaktifkan {#unlock-a-throttled-or-disabled-user}

```bash
docker exec -it snapotter snapotter-admin unlock-user <username>
```

Ini menghapus jendela `LOGIN_THROTTLED` di Redis dan memulihkan peran akun jika pengguna dinonaktifkan.

## Image lama dan cadangan {#older-images-and-fallbacks}

Pada image yang dibuat sebelum wrapper `snapotter-admin` ada, panggil skrip
secara langsung:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/admin-recovery.ts reset-mfa-policy
```

Sebagai upaya terakhir pada versi apa pun, tetapkan kebijakan di basis data. Pada
image all-in-one, Postgres berjalan di dalam kontainer:

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

Pada penyiapan multi-kontainer, arahkan `psql` ke `DATABASE_URL` Anda sendiri.

## Terkunci dari SSO, bukan MFA? {#locked-out-of-sso-not-mfa}

Jika login SSO yang ditegakkan gagal, gunakan akun lokal break-glass sebagai gantinya:
tetapkan `ssoBreakGlassUsername` ke admin lokal di Settings > Security sebelum Anda
menegakkan SSO, dan login dengan kata sandi akun tersebut.
