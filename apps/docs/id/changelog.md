---
description: "Catatan rilis dan riwayat versi untuk SnapOtter. Lihat apa yang baru, ditingkatkan, dan diperbaiki di setiap rilis."
i18n_source_hash: 9020073f127e
i18n_provenance: human
i18n_output_hash: c7b9d73d89fb
---

# Changelog {#changelog}

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 mengubah toolkit gambar menjadi rangkaian manipulasi file yang lengkap: 200+ tool di lima modalitas (Image, Video, Audio, PDF, dan Files), dibangun ulang di atas Postgres 17 dan antrean job berbasis Redis, dengan `docker run` satu perintah. Ini adalah rilis besar; baca Perubahan yang merusak kompatibilitas sebelum melakukan upgrade dari 1.x.

### Fitur baru {#new-features}

- **Empat modalitas tool baru**: Video, Audio, PDF, dan Files bergabung dengan Image, membawa katalog ke 200+ tool.
- **Background job yang tahan lama**: Antrean berbasis Redis (BullMQ) menjalankan setiap tool sebagai job yang dilacak dengan progres SSE langsung.
- **Mode all-in-one kontainer tunggal**: Satu `docker run` mem-boot instance lengkap dengan Postgres dan Redis tertanam.
- **Bundel AI sesuai permintaan**: Penghapusan latar belakang, OCR, transkripsi, upscaling, deteksi dan penyempurnaan wajah, penghapus objek, pewarnaan, dan restorasi foto dipasang dari UI. Akselerasi GPU terdeteksi per framework.
- **Sign PDF**: Gambar, ketik, atau unggah tanda tangan lalu tempatkan di PDF langsung di browser.
- **Automate**: Pembuat pipeline visual yang merangkai tool, dengan sembilan templat siap pakai.
- **83 preset konversi sekali klik**: Konverter khusus JPG-ke-PNG, MP4-ke-GIF, dan sejenisnya dengan pencarian fuzzy.
- **Editor gambar berbasis layer**: Editor bertenaga Konva di `/editor` dengan kuas, bentuk, penyesuaian, filter, dan kurva.
- **Pustaka Files**: Simpan hasil apa pun dan gunakan kembali sebagai input untuk tool lain.
- Tool yang disematkan, zoom dan pan dalam kanvas, 21 bahasa, dan kemampuan enterprise (OIDC/SSO, SAML, SCIM, penyimpanan S3, izin per tool, ekspor audit, pelacakan terdistribusi).

### Peningkatan {#improvements}

- Membatalkan proses yang sedang berjalan. (#137)
- Dekode RAW resolusi penuh melalui LibRaw, termasuk DNG. (#289)
- Deployment non-root dan foreign-UID (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Deteksi pemasangan AI yang akurat dan alur pemasangan yang diperkuat. (#214, #352)
- Penguatan privasi: tidak ada egress pihak ketiga otomatis, plus mode strict-offline opsional.
- Tombol umpan balik yang selalu aktif, bahkan dengan analitik dimatikan.

### Perbaikan bug {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` menonaktifkan pembatasan laju untuk route tool lagi. (#271)
- Memperbaiki jalur virtualenv AI di dalam image Docker. (#390)
- Kompatibilitas sharp 0.35.2+. (#362)
- Perbaikan tata letak editor gambar: penggaris, perilaku isian, sidebar, dan ukuran kanvas. (#258, #259)
- Menyelesaikan terjemahan bahasa Italia. (#231, #206, #425)
- Audio normalize dan loudnorm mempertahankan sample rate sumber.
- Penguatan SSRF: pencocokan CIDR IPv6 numerik dan pra-pemindaian URL yang diperluas. (#287)
- PDF yang dihasilkan diberi cap SnapOtter sebagai Producer.
- mediapipe terpasang di Python 3.13 dan Debian 13.

### Perubahan yang merusak kompatibilitas {#breaking-changes}

2.0 mengganti basis data SQLite tertanam dengan Postgres 17 dan menambahkan Redis 8 untuk antrean job. Data 1.x Anda bermigrasi secara otomatis pada boot pertama, tetapi stack kontainer berubah, jadi cadangkan seluruh volume `/data` Anda terlebih dahulu (1.x menjalankan SQLite dalam mode WAL, jadi data yang telah di-commit biasanya berada di `snapotter.db-wal`). Kemudian pilih image kontainer tunggal (Postgres dan Redis tertanam, hanya root) atau stack Compose (aplikasi plus Postgres 17 dan Redis 8). Lihat [panduan migrasi](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) dan [panduan upgrade](/id/guide/upgrading).

### Upgrade {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Atau dengan Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diff lengkap di GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Tool HTML ke Image baru, aksesibilitas WCAG 2.2 AA, penguatan keamanan dari pengujian penetrasi, dan 5 perbaikan Docker penting.

### Fitur baru {#new-features-1}

- **HTML ke Image**: Tangkap tangkapan layar dari URL atau HTML mentah sebagai PNG/JPEG/WebP. Tangkapan halaman penuh, viewport kustom, mode gelap.
- **Konvensi secret Docker _FILE**: Pasang variabel env sensitif sebagai file alih-alih teks biasa. (#205)
- **Lisensi enterprise dan penyimpanan S3**: Kunci lisensi komersial opsional dan penyimpanan objek yang kompatibel dengan S3.
- **Peningkatan editor bentuk**: Transparansi isian/goresan, pemilih warna RGBA, gaya garis putus-putus.
- **Arsip rilis siap pakai**: Unduh tarball dari GitHub Releases untuk instalasi non-Docker (Proxmox, bare metal, LXC). (#202)

### Peningkatan {#improvements-1}

- **Aksesibilitas WCAG 2.2 AA**: Lewati navigasi, jebakan fokus, region aria-live, dukungan gerakan tereduksi, rasio kontras yang benar. (#209)
- **Responsivitas seluler**: Pengaturan responsif, sambung ulang otomatis SSE saat beralih tab di seluler. (#203, #204)
- **Kualitas penghapusan latar belakang**: Penghalusan tepi, dekontaminasi warna, pemilihan format keluaran.
- **Terjemahan bahasa Italia**: ~145 string baru oleh @albanobattistella. (#206)
- **Dokumentasi API per tool**: 53 halaman dokumen dengan parameter, contoh, dan format respons.
- **Unduhan model AI**: Logika coba ulang dengan backoff eksponensial untuk HuggingFace. (#201)

### Perbaikan bug {#bug-fixes-1}

- Kontainer Docker yang baru sama sekali tidak dapat digunakan (pembatasan laju memblokir semua permintaan).
- Tool AI deteksi wajah (blur-faces, red-eye-removal, enhance-faces, passport-photo) gagal di semua platform.
- File HEIC rusak di ARM (ketidakcocokan simbol libheif).
- Bundel AI upscale dan restore-photo gagal dipasang di ARM.
- OCR menggunakan versi CUDA yang salah pada kontainer GPU.
- Bypass penjaga SSRF melalui alamat IPv6 yang dipetakan ke IPv4 heksadesimal. (Kredit: @tonghuaroot)
- Dekode HEIC iPhone dengan gambar tambahan. (#183, #199)
- Real-ESRGAN CUDA OOM pada GPU 8GB. (#200)
- 6 error Sentry produksi dan 7 bug QA. (#208)

### Keamanan {#security}

- 10 temuan uji penetrasi ditangani (bypass XFF, crash JSON cacat, pipeline tak terbatas, XSS log audit, metode TRACE, dan lainnya). (#207)
- Bypass SSRF IPv6 heksadesimal diblokir. (Kredit: @tonghuaroot)
- Image dasar Dockerfile disematkan berdasarkan digest.

### Upgrade {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Atau dengan Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diff lengkap di GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Demo langsung, halaman landing per tool, dan sekumpulan perbaikan penyempurnaan.

### Fitur baru {#new-features-2}

- **Demo langsung** - [demo.snapotter.com](https://demo.snapotter.com) memungkinkan orang mencoba SnapOtter tanpa memasang apa pun.
- **Halaman indeks tool** - Jelajahi semua 50+ tool di `/tools` dengan pencarian dan filter kategori.
- **50+ halaman landing SEO** - Setiap tool kini memiliki halaman landing khusus dengan FAQ, kasus penggunaan, dan tabel perbandingan.
- **Pratinjau latar belakang** - Slider sebelum-sesudah menampilkan latar belakang kotak-kotak di balik gambar transparan.
- **Generator kata sandi kuat** - Tombol sekali klik di formulir Add Members.

### Perbaikan bug {#bug-fixes-2}

- Tool info HEIC/HEIF tidak lagi gagal (pra-dekode ditambahkan).
- Pemasangan bundel model AI menampilkan pesan error yang lebih baik dan menghormati batas sumber daya.
- Thumbnail pustaka dimuat dengan benar (header autentikasi hilang).
- Menu dropdown tidak lagi terpotong pada tabel pengaturan People dan Teams.
- Persentase perbandingan ukuran disembunyikan pada tool non-kompresi.
- Tautan kebijakan privasi ganda dihapus.
- Terjemahan bahasa Italia ditambahkan untuk pengaturan fitur AI.
- Ikon Lucide yang diganti nama diperbarui (Wand2, Columns).

### Infrastruktur {#infrastructure}

- OpenSSF Scorecard diperkuat dari 4.3 ke ~7.0.
- Tes CI diparalelkan menjadi 4 shard dengan fixture yang diperkecil.
- 41 pembaruan dependensi.

### Upgrade {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Atau dengan Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diff lengkap di GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Lima tool baru, editor gambar lengkap, login SSO, 20 bahasa. Mungkin seharusnya menjadi tiga rilis terpisah, tetapi jadinya begini.

### Fitur baru {#new-features-3}

- **Editor gambar** - Layer, kuas, bentuk, penyesuaian, filter, kurva, pintasan keyboard. Berjalan di browser Anda, memproses di perangkat keras Anda.
- **Autentikasi OIDC / SSO** - Login dengan Google, GitHub, Okta, atau penyedia OpenID Connect apa pun. Atur beberapa variabel env dan tim Anda memakai akun mereka yang sudah ada.
- **Generator meme** - 100 templat bawaan dengan render teks melalui opentype.js. Atau unggah gambar Anda sendiri.
- **Beautify** - Masukkan tangkapan layar, keluarkan gambar yang dipoles. Bingkai perangkat (macOS, Windows, browser), bayangan, gradien, preset media sosial.
- **Simulasi buta warna** - Pratinjau tampilan gambar dengan protanopia, deuteranopia, tritanopia, dan defisiensi penglihatan warna lainnya.
- **Pemperbaiki transparansi PNG** - Mendeteksi PNG transparan-palsu dan memperbaikinya dengan matting HR BiRefNet. Penghapusan watermark opsional melalui inpainting LaMa.
- **Perluasan kanvas AI** - Perluas batas gambar dengan isian AI. Tiga tingkat kualitas (cepat, seimbang, kualitas) tergantung berapa banyak waktu GPU yang ingin Anda korbankan.
- **20 bahasa** - Arab, Mandarin (Sederhana/Tradisional), Ceko, Belanda, Prancis, Jerman, Hindi, Indonesia, Italia, Jepang, Korea, Polandia, Portugis, Rusia, Spanyol, Thai, Turki, Ukraina, Vietnam. RTL berfungsi untuk bahasa Arab.
- **Impor URL** - Tempelkan URL ke dropzone atau impor massal dari daftar. Pengambilan sisi server dengan proteksi SSRF.
- **Penghapus multi-file** - Gambar mask penghapus di beberapa gambar, proses semuanya dengan satu klik. Goresan bertahan per gambar.
- **Impor/ekspor pipeline** - Simpan rantai tool sebagai JSON, bagikan dengan orang lain.
- **17 format RAW kamera baru** melalui exiftool, plus input QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ, dan APNG. Codec keluaran baru untuk BMP, ICO, JP2, QOI. Ekspor AVIF, TIFF, GIF, JXL, dan PSD dipulihkan dari cabang yang sebelumnya hilang.

### Peningkatan {#improvements-2}

- **Penyempurnaan gambar** - Mengganti pipeline lama dengan CLAHE + normalise + gamma. Toggle Deep Enhance baru menggunakan model AI untuk hasil yang lebih agresif.
- **Restore photo** - Deteksi goresan ditulis ulang dengan pemfilteran Otsu 8-sudut. Inpainting LaMa kini berjalan pada resolusi native.
- **Format eksotis di mana-mana** - OCR, image-to-PDF, generator favicon, komposisi, stitch, dan vectorize semuanya kini mendekode HEIC, RAW, PSD.
- **Compress** - Toleransi ukuran target diperketat dari 5% ke 1%. Ukuran target adalah mode default. Menambahkan tombol stepper dan pemilih unit KB/MB.
- **Pembersihan Sentry** - 644 peristiwa tak dapat ditindaklanjuti difilter. Error nyata kini ditangani dengan benar.
- **Deteksi GPU** - Diagnostik lebih baik untuk kontainer di mana CUDA ada tetapi nvidia-smi tidak.
- **Mode auth dinonaktifkan** - Pengguna anonim ditanamkan di DB dengan peran admin. Kunci API, pipeline, dan file pengguna tidak lagi rusak karena kendala FK.
- **2.705+ tes baru** di seluruh unit, integrasi, dan E2E.

### Perbaikan bug {#bug-fixes-3}

- Upscale di CPU tidak lagi kehabisan waktu pada perangkat NAS dan perangkat keras berdaya rendah.
- Logo kode QR tidak lagi membuat pratinjau menghilang secara permanen.
- Overflow crop diperbaiki untuk gambar potret tinggi.
- File alfa TIFF dengan benar memaksa keluaran PNG alih-alih menghasilkan korupsi.
- Dekode HDR/EXR mengonversi ke 8-bit sebelum CLAHE, memperbaiki kegagalan dekode.
- Buffer input landmark wajah dikonversi ke PNG sebelum sidecar Python, memperbaiki crash.
- Find duplicates menangani batch berformat campuran dan error jaringan.
- Pratinjau Beautify diperbarui secara real time.
- Bilah progres untuk stitch dan vectorize.
- SVGZ ditangani oleh SVG-to-raster.
- Nama file non-ASCII diperbaiki melalui header X-File-Results yang di-percent-encode.

### Upgrade {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Atau dengan Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diff lengkap di GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Image Docker terpadu dengan deteksi otomatis GPU. Satu image menangani beban kerja CPU dan GPU. Compose yang disederhanakan menjadi satu file dengan rotasi log. Pra-unduh model kini menyertakan verifikasi dan smoke test.

---

## v1.13.0 {#v1-13-0}

Kontrol akses berbasis peran (RBAC). 14 izin granular, tiga peran bawaan (admin, editor, user), dukungan peran kustom. Pemeriksaan izin pada semua route API. Tab frontend difilter berdasarkan izin pengguna.

---

## v1.12.0 {#v1-12-0}

Tool PDF ke Image. Konversi halaman PDF ke PNG, JPEG, WebP, atau TIFF pada DPI kustom. Image Docker terpadu dengan deteksi otomatis GPU.

---

## v1.11.0 {#v1-11-0}

llms.txt yang dibuat otomatis melalui vitepress-plugin-llms untuk dokumentasi yang ramah AI.

---

## v1.10.0 {#v1-10-0}

Pengubahan ukuran sadar-konten (seam carving) dengan proteksi wajah. Ubah ukuran gambar sambil mempertahankan konten penting.

---

## v1.9.0 {#v1-9-0}

Tool Stitch / Combine. Gabungkan gambar secara berdampingan, ditumpuk vertikal, atau dalam kisi kustom.

---

## v1.8.0 {#v1-8-0}

Tool Edit Metadata. Lihat dan edit metadata EXIF, IPTC, dan XMP dengan antarmuka strip/keep yang granular.

---

## Rilis lama {#older-releases}

Untuk changelog tingkat commit yang lengkap termasuk rilis patch, lihat [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
