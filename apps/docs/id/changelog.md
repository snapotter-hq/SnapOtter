---
description: "Catatan rilis dan riwayat versi SnapOtter. Lihat apa yang baru, ditingkatkan, dan diperbaiki di setiap rilis."
i18n_source_hash: 76c6d18aedb4
i18n_provenance: machine
i18n_output_hash: ff20b7ce9afd
i18n_hash_version: 2
---

# Changelog {#changelog}

## Belum dirilis {#unreleased}

### Tidak digunakan lagi {#unreleased-deprecated}

- **Kelima operasi kompres-ke-ukuran untuk gambar sudah tidak digunakan lagi (deprecated).** `/api/v1/tools/image/compress-image-to-20kb`, `-50kb`, `-100kb`, `-200kb`, dan `-500kb` ditandai deprecated di spesifikasi OpenAPI dan akan tetap ada setidaknya selama satu rilis minor. Kirim `POST /api/v1/tools/image/compress` dengan `settings` diatur ke `{"mode":"targetSize","targetSizeKb":20}` (atau 50, 100, 200, 500). Hasilnya sama. Jalur preset PDF tidak berubah.

## v2.3.0 {#v2-3-0}

SnapOtter baru saja melewati satu juta pull image di Docker Hub dan GHCR, serta 3.000 bintang di GitHub. Itu berarti banyak server self-hosted, jadi rilis ini adalah ucapan terima kasih kami kepada semua yang menjalankannya.

Segera perbarui. Versi 2.3.0 menutup enam advisori keamanan, satu di antaranya bertingkat keparahan tinggi. Detailnya ada di bagian Keamanan di bawah.

Selain perbaikan, ada alat baru: editor halaman PDF Multi-Tool, preset kompres-ke-ukuran satu klik untuk gambar dan PDF, serta pengurutan halaman dengan seret dan lepas di Organize PDF. OCR kini membaca bahasa Arab, dan pdf-to-text menawarkan OCR ketika menemui PDF hasil pindai. SnapOtter dapat berjalan di bawah subpath seperti `/snapotter` di belakang reverse proxy. Aplikasi tidak lagi memerlukan superuser Postgres untuk berjalan. Admin yang terkunci dapat melakukan pemulihan dari command line. Sisanya sekitar 1.400 perbaikan, sebagian besar untuk masalah yang Anda laporkan.

> [!IMPORTANT]
> Keenam advisori di bawah ini memengaruhi 2.2.0, dan beberapa berlaku sejak 2.0.0. Jika Anda berbagi instance dengan pengguna lain atau membukanya di luar jaringan Anda sendiri, perbarui.

### Keamanan {#v2-3-0-security}

- **Unggahan SVG dapat melewati sanitasi (GHSA-9c7h-xjrp-8gh3, tinggi).** SVG yang ditolak oleh dekoder gambar disimpan dan disajikan apa adanya tanpa disanitasi. Terdampak: 2.2.0 dan sebelumnya. Dilaporkan oleh @xaferima. (#1211)
- **Aliran progres job tidak memeriksa siapa yang meminta (GHSA-ff22-w6x2-fm98, sedang).** Kini aliran ini mewajibkan login dan kepemilikan job. Terdampak: 2.0.0 hingga 2.2.0. (#1750)
- **Tautan unduhan hasil juga menyajikan unggahan asli (GHSA-jgv3-2jc6-f628, sedang).** Terdampak: 2.2.0 dan sebelumnya. Dilaporkan oleh @emirhancatkin. (#3623)
- **Foto paspor dan efek latar belakang memercayai ID job yang diberikan klien (GHSA-3c8g-8v4x-qq9j, sedang).** Terdampak: 2.2.0 dan sebelumnya. Dilaporkan oleh @shaoyuuuuu. (#3623)
- **Impor URL, unggahan, dan pratinjau melewati pemeriksaan izin peran dan kunci API (GHSA-8xxr-g2w8-7f9r, sedang).** Terdampak: 2.2.0 dan sebelumnya. Dilaporkan oleh @nguyenvantiennani. (#3780, #707)
- **Penegakan SSO mengungkap nama pengguna break-glass (GHSA-q6fg-vvw9-cr8r, rendah).** Login lokal yang ditolak kini mendapat 401 yang sama seperti login gagal lainnya. Terdampak: 2.0.0 hingga 2.2.0. (#2148)
- **Postgres tidak lagi berjalan sebagai superuser.** Aplikasi kini terhubung dengan role yang hanya dapat membaca dan menulis data. Migrasi menggunakan koneksi terpisah yang opsional. Lihat Catatan Upgrade. (#918)
- **Dependensi yang ditambal**: batas bawah override dompurify dan handlebars dinaikkan ke versi yang sudah diperbaiki. (#4247)

### Fitur Baru {#v2-3-0-new-features}

- **PDF Multi-Tool**: editor halaman yang mengurutkan ulang, menggandakan, memutar, dan menghapus halaman, serta menarik halaman dari PDF lain. Server menyusun file akhir. (#1338)
- **Kompres ke ukuran target dalam satu klik**: lima preset gambar (20, 50, 100, 200, 500 KB) dan lima preset PDF (100, 200, 500 KB, 1 MB, 2 MB). (#1250, #1377)
- **Jalankan SnapOtter di bawah subpath**: atur `BASE_PATH=/snapotter` dan image yang sama akan disajikan dari sana. Tautan hasil, cookie, pengalihan SSO, dan dokumentasi API semuanya mengikutinya. (#1252, #1324)
- **OCR Arab**: pilih bahasa Arab secara eksplisit, atau biarkan mode otomatis mendeteksinya. Berfungsi untuk OCR gambar dan PDF. (#4130, #4183)
- **pdf-to-text menawarkan OCR** ketika sebuah PDF, atau seluruh batch, tidak memiliki lapisan teks, alih-alih mengembalikan file kosong. (#4142, #4198)
- **Pengurutan halaman dengan seret dan lepas di Organize PDF**, dengan mouse maupun sentuhan. (#1249, #2601)
- **Urutkan ulang file sebelum proses multi-file**: merge, stitch, collage, dan alat multi-file lainnya mempertahankan urutan yang Anda atur. (#756, #757)
- **Batalkan proses batch dan pipeline**, dan pekerjaan di server benar-benar berhenti. (#807)
- **Perintah pemulihan `snapotter-admin`**: `reset-password`, `create-admin`, `unlock-user`, dan reset MFA, untuk admin yang terkunci dari UI web. (#4016)
- **Pendaftaran MFA saat login**: ketika MFA diwajibkan, pengguna yang belum memilikinya menyiapkannya saat itu juga alih-alih diblokir.
- **Tangkap kamera dan aplikasi yang dapat diinstal**: ambil foto langsung ke sebuah alat di ponsel, dan instal SnapOtter sebagai PWA. (#773)
- **Padding transparan di dialog Ukuran Kanvas editor.** (#4111)
- **Pemberitahuan pembaruan untuk admin**: ketika SnapOtter versi lebih baru tersedia, admin melihat pemberitahuan yang dapat ditutup beserta tautan ke catatan rilis. Pemeriksaan berjalan melalui koneksi analitik yang sudah ada, sehingga mati ketika analitik dimatikan.

### Peningkatan {#v2-3-0-improvements}

- **Penghapusan latar belakang lebih cepat pada proses berulang**: model tetap dimuat di antara permintaan alih-alih dimuat ulang setiap kali. (#4144)
- **Unggahan batch menggunakan memori jauh lebih sedikit**: setiap file masuk ke disk sementara dan diproses satu per satu alih-alih berada di RAM. (#2687)
- **Instalasi bundel AI gagal dengan bersih dan di-rollback** alih-alih meninggalkan venv yang setengah terpasang. Instalasi penghapusan latar belakang di Proxmox LXC berfungsi kembali, dan host dengan memori rendah mendapat batas CPU yang wajar sebelum job dimulai. (#2628, #2597, #2526, #2546)
- **Deteksi GPU lebih andal**: CUDA dideteksi melalui driver, kartu seri RTX 50 beralih ke CPU alih-alih gagal, dan encoder video perangkat keras diuji coba sebelum digunakan. (#4225, #4075, #3980, #3983)
- **`MAX_WORKER_THREADS` kini berfungsi**. Sebelumnya diurai tetapi tidak pernah diterapkan. (#3249)
- **Alat yang lama mendapat batas waktu yang panjang**: pdf-to-word, compress-pdf, convert-document, dan content-aware resize tidak lagi kehabisan waktu terlalu cepat pada file besar. (#3276)
- **Compress PDF menjaga hasil pindai tetap terbaca**, dan memberi tahu ketika ukuran target tidak dapat dicapai alih-alih menghasilkan file yang tidak terbaca. (#4112)
- **Login gagal dibatasi per nama pengguna**: lebih dari sepuluh kali dalam lima belas menit mendapat 429 dengan `Retry-After`. (#827)
- **Error menyebutkan apa yang salah**: binary yang hilang, kesalahan penyimpanan, proses yang dihentikan karena kehabisan memori, dan batas unggahan kini mendapat pesan yang spesifik alih-alih 500 atau 422 polos.
- **Log audit mencakup proses alat, batch, dan pipeline**, dan event pengguna, peran, tim, dan GDPR mencatat siapa melakukan apa kepada siapa. (#3991, #3984)
- **Container all-in-one berhenti saat boot pertama yang buruk** alih-alih restart tanpa henti, dan Postgres serta Redis bawaan memiliki batas waktu startup. (#3008, #1130)
- **Tanggal dan bentuk jamak mengikuti bahasa Anda**, dan string bahasa Inggris hardcode yang terakhir sudah diterjemahkan.
- **Penyempurnaan seluler dan editor**: tata letak slider, Sign PDF, dan crop di ponsel, seret sentuh, kuas piksel yang lebih cepat, serta Levels dan Curves dalam undo dan autosave.

### Perbaikan Bug {#v2-3-0-bug-fixes}

- **Adjust Colors menggabungkan pengaturan secara keliru**: suhu, saturasi, hue, kontras, dan sepia saling menimpa alih-alih bertumpuk. (#3153, #3120, #3469)
- **Pixelate tidak memberi efek piksel**, dan keluaran PNG diam-diam dikurangi palet warnanya di berbagai alat gambar. (#709, #716)
- **GIF dan WebP animasi kehilangan frame** di beberapa alat, dan palet serta transparansi GIF keluar salah. (#1184, #1225, #3407, #2573)
- **Unggahan yang diputar kehilangan kualitas**: auto-orient menghilangkan pengodean lossless, transparansi, dan kedalaman 16-bit. WebP animasi kini memutar setiap frame. (#2384, #2529)
- **TIFF dengan transparansi, file HEIF AV1, dan beberapa format RAW** gagal atau kehilangan alpha. (#2609, #2572, #1120)
- **Mengubah ukuran kanvas editor menskalakan gambar** alih-alih menambah ruang di sekelilingnya. (#2081)
- **Nama file keluaran rusak**: `.jpeg` dan `.tif` berubah menjadi hal lain, dan dotfile atau nama yang mengulang ekstensinya bermasalah. (#3495, #3382)
- **Simpan otomatis Pustaka mengabaikan kuota penyimpanan**, dan penghitung penyimpanan bisa menjadi negatif. (#2389, #2585)
- **Job yang macet setelah restart** kini diselesaikan saat startup alih-alih menampilkan "processing" selamanya. (#3219, #3193)
- **Login OIDC menamai setiap pengguna baru "admin"**, dan login iOS Safari berakhir di halaman error setelah berhasil. (#862, #4021)
- **Aturan kata sandi yang dinonaktifkan tetap diberlakukan** saat membuat pengguna. (#1028)
- **PDF yang rusak menggantung selama 30 detik** sebelum gagal. (#920)
- **Pemeriksaan disk bundel AI meminta sekitar 18 GB** untuk memasang satu bundel. (#1248)
- **Compress Video gagal pada rekaman layar dengan frame rate variabel.** (#2427)
- **Penghapusan latar belakang batch kehilangan hasil yang sudah selesai** ketika browser mencoba ulang permintaan. (#2015)
- **Kolom angka di Pengaturan tidak dapat dikosongkan** saat mengetik. (#1449)
- **Mematikan analitik meninggalkan event dalam antrean untuk dikirim** sekitar 30 detik kemudian. Kini event tersebut dibuang saat Anda memilih keluar. (#4270)

### Catatan Upgrade {#v2-3-0-upgrade-notes}

Migrasi berjalan sendiri saat startup. Anda tidak perlu menjalankan SQL apa pun.

- **Role database.** File Compose kanonis kini memberi aplikasi role yang hanya dapat membaca dan menulis data (`DATABASE_URL`) dan koneksi berhak istimewa terpisah (`DATABASE_MIGRATION_URL`) yang hanya digunakan saat boot untuk migrasi dan grant. File Compose yang sudah ada tetap berfungsi seperti sebelumnya: biarkan `DATABASE_MIGRATION_URL` tidak diatur dan SnapOtter berjalan dengan satu role. Untuk deployment non-lokal, atur `POSTGRES_APP_PASSWORD` bersama `POSTGRES_PASSWORD`.
- **Pemeriksaan startup yang lebih ketat.** Sebelumnya ini gagal belakangan, atau diam-diam. Kini semuanya menghentikan container dengan pesan yang menyebutkan variabelnya: `DEFAULT_LOCALE` yang tidak didukung (gunakan kode yang didukung seperti `de`, bukan `de_DE`), `SAML_IDP_SSO_URL`, `SAML_CALLBACK_URL`, atau `OIDC_ISSUER_URL` yang salah format saat SSO aktif, daftar `TRUST_PROXY` yang tidak valid, `BASE_PATH` yang salah, dan `LOG_DIR` yang tidak dapat ditulis.
- **`TRUST_PROXY` tidak lagi menerima jumlah hop.** Angka seperti `TRUST_PROXY=2` kini menghentikan container saat startup alih-alih diam-diam tidak memercayai proxy mana pun. Atur ke alamat proxy atau rentang bernama (defaultnya `loopback,linklocal,uniquelocal`), `false` ketika tidak ada proxy di depan SnapOtter, atau `true` hanya ketika proxy yang Anda kendalikan berada di depan pada alamat publik. (#998)
- **`MAX_WORKER_THREADS` kini berlaku.** Jika Anda mengaturnya dan sebelumnya tidak melihat perubahan, sekarang Anda akan melihatnya.
- **Kode status API.** Kesalahan engine dan penyimpanan mengembalikan 503 `ENGINE_UNAVAILABLE` (endpoint batch sebelumnya mengembalikan 422). Unggahan yang melebihi batas mengembalikan 413 (sebelumnya 400). `clientJobId` yang salah format mengembalikan 400 dan yang dipakai ulang 409 (sebelumnya 500). Memutar ulang batch pipeline Anda sendiri mengembalikan 202. `mode=targetSize` tanpa `targetSizeKb` mengembalikan 400. Login lokal yang ditolak di bawah penegakan SSO mengembalikan 401 alih-alih 403 `SSO_ENFORCED`. Login yang dibatasi mengembalikan 429 `LOGIN_THROTTLED`. Hasil remove-background tidak lagi menyertakan `originalUrl`.
- **Variabel opsional baru**: `BASE_PATH`, `DATABASE_MIGRATION_URL`, `GDPR_EXPORT_TIMEOUT_MS` (15 menit secara default, `0` menonaktifkan), `EMBEDDED_REDIS_TIMEOUT_S` (180), dan `EMBEDDED_POSTGRES_TIMEOUT_S` (600).
- **File Compose disertakan bersama rilis.** `docker-compose.yml` dan `docker-compose-gpu.yml` dilampirkan pada rilis ini, sehingga Anda dapat mengunduhnya langsung dari halaman rilis.

### Ucapan Terima Kasih {#v2-3-0-acknowledgements}

Satu juta pull berarti banyak orang yang melaporkan bug, mengirim perbaikan, dan memberi tahu kami apa yang kurang. Rilis ini sebagian besar adalah hasil kerja mereka.

Kode dan kontribusi:

- **@zakka258** ❤️: Membangun editor halaman PDF Multi-Tool dan deployment subpath, dua fitur terbesar di rilis ini, termasuk pengujian untuk auth dan SSO di bawah subpath. (#1338, #1252, #1324, #1295)
- **@akshat-lakhera** ❤️: Membangun preset gambar kompres-ke-ukuran satu klik, memperbaiki konkurensi dan pembersihan pratinjau, serta menghentikan penyimpanan browser yang diblokir menggantungkan spinner login. (#1250, #1368, #2359)
- **@ChrisCreatesNet** ❤️: Menambahkan pengurutan ulang halaman dengan seret dan lepas ke Organize PDF, yang pertama kali mereka minta di Discussions. (#1249, #965)
- **@drakeo338** ❤️: Sepuluh perbaikan di seluruh stack, termasuk auto-orient yang mempertahankan format dan kualitas, grup SCIM yang dibuat dalam satu transaksi, instalasi AI di bawah cgroup v2, dan error 5xx yang tidak lagi disamarkan sebagai 422. (#1229, #2014, #1638, #1667)
- **@SuranaSanyam** ❤️: Menambahkan padding kanvas transparan ke editor, memperbaiki vonis ukuran target Compress PDF yang basi, dan mengizinkan pembaruan tim sebagian. (#4111, #4112, #1906, #2366, #2367)
- **@thejdubb02** ❤️: Menghentikan instance self-hosted mengirim data heatmap, memvalidasi `TRUST_PROXY` saat startup alih-alih crash, dan memperbaiki penanganan nama grup SCIM dan timeout qpdf. (#1051, #1052, #1053, #993, #994)
- **@88subarno88** ❤️: Mengubah beberapa 500 menjadi jawaban 400 dan 409 yang tepat untuk ID job yang salah format dan impor multipart, serta memperbaiki pengosongan kolom angka di Pengaturan. (#1486, #1556, #1603, #1449)
- **@harshoutoftokens** ❤️: Membuat pembacaan barcode berfungsi offline dengan menyertakan dekodernya, memperbaiki pratinjau media yang menampilkan input, dan menyempurnakan pencarian format. (#1401, #1512, #1388)
- **@darklabs9** ❤️: Melaporkan dan memperbaiki Compress Video yang gagal pada rekaman layar dengan frame rate variabel. (#2426, #2427)
- **@dvd233** ❤️: Mengekspos setiap format RAW kamera yang didukung dekoder, dan membuat alat favicon muncul untuk pencarian ICO. (#1120, #1121)
- **@bercedev** ❤️: Memperbaiki nama file yang batang namanya mengulang ekstensi, dan membuat AI melaporkan perangkat yang benar-benar digunakannya. (#3382, #3613)
- **@pamod-madubashana** ❤️: Menerjemahkan judul MFA terakhir yang masih berbahasa Inggris saja dan menghubungkan string progres yang tidak terpakai. (#1228, #1227)
- **@mvanhorn** ❤️: Memperbaiki alokasi nama pengguna ganda pada login SAML. (#2640)
- **@peremunoz** ❤️: Menghentikan pembuatan barcode menyembunyikan kesalahan penyimpanan dan memori sebagai "Invalid text". (#4057)
- **@mayuriphad** ❤️: Memperbaiki crash pada header autentikasi alert tersimpan yang salah format. (#3080)
- **@DevShoaib78** ❤️: Memperbaiki penutupan lasso poligonal di editor. (#1207)
- **@dltsum** ❤️: Memindahkan tampilan progres ke katalog pesan bersama. (#1262)
- **@albanobattistella** ❤️: Perbaikan terjemahan. (#1024)
- **@shoaibyazdani** ❤️: Membuat ulang baseline visual macOS. (#2475)

Pengungkapan keamanan:

- **@xaferima** ❤️: Menemukan bahwa SVG yang ditolak dekoder melewati sanitasi, dan menelaah dampaknya bersama kami. (GHSA-9c7h-xjrp-8gh3, #1211)
- **@emirhancatkin** ❤️: Menemukan bahwa tautan hasil juga menyajikan unggahan asli. (GHSA-jgv3-2jc6-f628, #3623)
- **@shaoyuuuuu** ❤️: Menemukan bahwa foto paspor dan efek latar belakang memercayai ID job yang diberikan klien. (GHSA-3c8g-8v4x-qq9j, #3623)
- **@nguyenvantiennani** ❤️: Menemukan bahwa impor URL melewati pemeriksaan izin. (GHSA-8xxr-g2w8-7f9r, #3780)
- **tonghuaroot** ❤️: Melaporkan bypass IPv6 pada pemeriksaan alamat SSRF, lengkap dengan proof of concept yang berfungsi. Perbaikannya dirilis di 2.0.0, dan ucapan terima kasih ini sudah terlambat. (#287)

Laporan bug:

- **@kabo** ❤️: Contoh `docker-compose.yml` tidak berfungsi. (#1027)
- **@xromen** ❤️: PDF rusak menggantung hingga timeout qpdf 30 detik. (#920)
- **@snmabaur** ❤️: Login OIDC mengatur setiap nama profil menjadi "admin". (#862)
- **@CodecNomad** ❤️: Alat Blur menggandakan gambar. (#829)
- **@ohora0923** ❤️ dan **@Alexis-VS-CSharp** ❤️: Pixelate tidak berfungsi. (#678, #775)
- **@mptpro** ❤️: Unduhan AI penghapusan latar belakang gagal. (#714)
- **@dominic427** ❤️: Mengubah ukuran kanvas editor menskalakan gambar alih-alih memperluasnya. (#2016)
- **@CodeByToast** ❤️: Kolom angka di Pengaturan yang tidak dapat dikosongkan. (#1186)
- **@gioxx** ❤️: Pemeriksaan disk bundel AI meminta sekitar 18 GB untuk satu bundel. (#1248)
- **@rekcodocker** ❤️ dan **@madmike970** ❤️: Instalasi bundel AI gagal di Proxmox LXC, beserta detail container yang membantu mempersempit penyebabnya. (#1030, #352)
- **@wxf26054** ❤️: Aturan kata sandi yang dinonaktifkan tetap diberlakukan saat membuat pengguna. (#1028)
- **@ersil** ❤️: iOS Safari meminta callback OIDC dua kali dan mendarat di halaman error setelah login berhasil. (#4021)
- **@casi-3** ❤️: Penghapusan latar belakang batch kehilangan hasil yang sudah selesai ketika browser memutar ulang permintaan, disertai diagnosis yang tepat. (#2015)
- **@killervette42** ❤️: Kegagalan GPU Blackwell di unRaid, yang menjadi bahan bagi fallback CPU untuk seri RTX 50. (#120, #4075)

Permintaan fitur dan masukan:

- **@photoevents** ❤️: Mengukur bahwa penghapusan latar belakang menghabiskan sekitar 11 detik memuat model dan 1 detik untuk inferensi, mengusulkan caching sesi, dan membagikan apa yang mereka pelajari dari menjalankan cache sendiri. Itu menjadi session cache di rilis ini. (#768, #776, #4144)
- **@benbou8231** ❤️: Menunjukkan bahwa file yang diimpor masuk dalam urutan terbalik di alat multi-file, yang mengarah ke pengurutan ulang sebelum proses. (#729, #756)
- **@cf3901646** ❤️: Melacak error produksi yang berisik hingga ke kelas error Postgres 58 dan mengusulkan perbaikannya. Kami tidak dapat menggabungkan PR mereka tanpa CLA yang ditandatangani, jadi kami menulis perbaikan yang sama sendiri. (#4210, #4253)
- **@chiliec** ❤️: Menyadari bahwa auto-orient yang gagal ditelan secara diam-diam dan bahwa progres instalasi mengabaikan katalog terjemahan. Kedua usulan dirilis melalui PR maintainer. (#1266, #1416, #1258, #1262)
- **@wahajahmed010** ❤️: Mengusulkan single-flight untuk impor modul enterprise, perbaikan bagi permintaan SCIM bersamaan yang tidak sepakat soal lisensi. (#1267, #1283)
- **@chenzeyan54-commits** ❤️: Menunjukkan bahwa panduan konfigurasi tidak pernah menyebutkan override binary engine atau `SNAPOTTER_HW_ACCEL`, yang kini sudah didokumentasikan. (#1312, #1696)
- **@aron-intframe** ❤️: Mereproduksi celah penanganan error exiftool pada clone baru dan menemukan bahwa race pada path sementara lebih buruk daripada yang dijelaskan di issue. (#3458)

Terima kasih juga kepada anggota komunitas yang melaporkan hal-hal ini lewat Discord dan email, yang namanya tidak kami catat.

[Selisih lengkap di GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.2.0...v2.3.0)

---

## v2.2.0 {#v2-2-0}

Sebagian besar 2.2 adalah penguatan keamanan. Non-admin yang memegang role `users:manage` yang didelegasikan dapat mengambil alih sebuah instance, dan ternyata setiap endpoint alat tidak memiliki pemeriksaan izin. Perbarui jika Anda menjalankan lebih dari satu pengguna.

Sisanya adalah ekor panjang dari self-hosting: unduhan yang dimulai tetapi tidak pernah selesai, preset yang rusak begitu Anda menambahkan file kedua, container yang crash-loop saat Postgres masih naik. Dua alat baru juga hadir. Dokumentasi dan situs web kini diterjemahkan ke 21 bahasa, dan antarmuka akhirnya memenuhi kontras WCAG AA.

> [!IMPORTANT]
> Jika Anda memberikan `users:manage` kepada non-admin melalui role kustom, role tersebut dapat mengambil alih akun administrator pada 2.0.0 hingga 2.1.0. Detail ada di Keamanan.

### Keamanan {#v2-2-0-security}

- **Eskalasi hak istimewa melalui role `users:manage` yang didelegasikan (GHSA-9xgh-95qh-2x7h).** Non-admin yang memegang `users:manage` melalui role kustom dapat mereset kata sandi, atau menghapus, akun dengan hak istimewa lebih tinggi, termasuk administrator bawaan, dan mengambil alih instance. Reset kata sandi dan penghapusan akun kini memverifikasi wewenang pemanggil atas target, sehingga role yang didelegasikan tidak dapat menjangkau di atas levelnya sendiri. Terdampak: 2.0.0 hingga 2.1.0. Dilaporkan oleh 李春来 (Chunlai Li). (#616)
- **Setiap endpoint alat kini dijaga.** Akses alat sebelumnya ditegakkan rute demi rute, sehingga ke-45 rute yang ditulis tangan harus mengingat pemanggilan yang sama dan tidak satu pun melakukannya. Role tanpa `tools:use` masih dapat menjalankan image-to-pdf, erase-object, upscale, sign-pdf, dan lainnya. Pemeriksaan kini berada di satu preHandler yang dikunci pada rute yang cocok, sehingga mencakup sub-path dan rute apa pun yang ditambahkan nanti. (#646)
- **Pembatasan laju dapat dilewati pada instalasi Docker.** Image dikirim dengan `TRUST_PROXY=true`, sehingga IP klien berasal dari header permintaan dan `X-Forwarded-For` yang dipalsukan lolos dari pembatas login. Defaultnya kini daftar kepercayaan jaringan privat. (#649)
- **Penulisan pengaturan diperiksa per pengaturan**, bukan sekali di pintu masuk, dan impor konfigurasi kini transaksional sehingga kunci yang ditolak tidak dapat meninggalkan konfigurasi yang diterapkan setengah-setengah. (#618)
- **Nama file Pustaka tidak dapat keluar dari root penyimpanannya.** Nama tersimpan yang direkayasa, yang disalin apa adanya oleh impor SQLite 1.x berbahaya, dapat membaca atau menghapus file di luar direktori file. Hanya dapat dijangkau setelah operator mengimpor database SQLite 1.x yang diberikan penyerang, yang merupakan satu-satunya jalur yang memungkinkan nama tersimpan dipilih. Dilaporkan oleh @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **Pembatalan job menegakkan kepemilikan**, sehingga pengguna terautentikasi tidak lagi dapat membatalkan job pengguna lain dengan ID-nya. Dilaporkan oleh @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Audit ulang seluruh pohon 2.0 menangkap apa yang masih terbuka**: assertion SAML yang tertangkap dapat diputar ulang, challenge MFA bertahan setelah berapa pun kode salah, pencarian kunci API per permintaan berupa pemindaian tabel penuh, `MAX_WORKSPACE_SIZE_GB` adalah konfigurasi mati, dan sanitizer SVG meloloskan href `javascript:` tanpa tanda kutip. (#620)
- **Sembilan CVE yang diungkapkan ditambal**: fast-uri, svgo, sharp, dan tar secara transitif (#619), ditambah Pillow 12.3.0 (#517). Dekode RAW di arm64 kini membangun LibRaw 0.22.2 dari sumber alih-alih menautkan salinan sistem yang belum ditambal. (#649)

### Fitur Baru {#v2-2-0-new-features}

- **Rounded Crop**: mask persegi bulat dan squircle gaya iOS, dengan kontrol radius sudut. Dibuat untuk favicon dan ikon aplikasi. (#602)
- **Remove GIF Background**: hapus latar belakang dari GIF, WebP, atau APNG animasi frame demi frame dan dapatkan animasi transparan. (#502)
- **Lasso dan mode High Quality pada Object Eraser**: seret loop bebas alih-alih mengecat setiap piksel, dan secara opsional pasang bundel inpainting difusi untuk isian area luas yang lebih bersih. (#503, #566)
- **Simpan sebagai baru, atau timpa.** Mengedit file Pustaka sebelumnya diam-diam menggantikan aslinya. Kini Anda memilih per pengeditan, dan defaultnya mempertahankan aslinya. (#564, #577)
- **Preset rasio aspek di Resize.** Pilih 1:1, 4:3, atau 16:9 dan kedua dimensi tetap terkunci, tanpa upscaling. (#530)
- **OCR dua tingkat**: tingkat cepat sudah disertakan di dalam image dan berjalan offline tanpa unduhan, dan runtime yang lebih akurat dipasang sesuai permintaan. (#519)
- **Ketik di mana saja untuk mencari.** Mulai mengetik di dasbor atau beranda dan teks masuk ke kotak pencarian. (#644)
- **Dokumentasi dan situs web dalam 21 bahasa**: situs dokumentasi, halaman landing, dan referensi API semuanya sudah diterjemahkan, menyusul antarmuka aplikasi. Panduan deployment sumber daya rendah yang baru mencakup Raspberry Pi dan mesin 2 GB. (#548)
- **Nama alat yang lebih jelas**: 18 nama yang ambigu kini menyertakan kualifikasi sendiri, sehingga "Compress" menjadi "Compress Image". ID alat dan rute tidak berubah, jadi tidak ada bookmark yang rusak. (#520)

### Peningkatan {#v2-2-0-improvements}

- **Kontras WCAG AA di seluruh antarmuka**: palet disetel ulang sehingga oranye cerah tetap untuk isian sementara teks dan label memakai token tinta yang aksesibel, dan ke-57 indikator fokus kini memenuhi batas 3:1 untuk non-teks. (#567, #574)
- **Upscale dan penghapusan latar belakang tidak lagi tampak beku**: bilah progres bergerak selama inferensi alih-alih berhenti di 30%, dan kedua alat kini memperingatkan bahwa host hanya-CPU jauh lebih lambat. (#605, #608)
- **Pesan timeout menyebutkan penyebab sebenarnya** dan memperhitungkan host hanya-CPU alih-alih menyalahkan unggahan. (#596)
- **SnapOtter menunggu Postgres dan Redis saat startup** alih-alih crash-loop, baik di Compose maupun image all-in-one. Instalasi Proxmox LXC sempat restart 76 kali sebelum ini. (#537, #595)
- **Unduhan bertahan melewati reverse proxy**: SnapOtter meminta nginx dan proxy yang kompatibel untuk tidak mem-buffer respons file, yang biasanya menjadi alasan unduhan self-hosted dimulai tetapi tidak pernah selesai. (#604, #607)
- **Compress PDF mendarat mendekati ukuran target**, dan menyatakannya dengan jujur ketika target tidak terjangkau. (#522)
- **Kontrol alat di seluler tetap terjangkau** karena shell aplikasi kini mengikuti ukuran viewport dinamis. (#559)
- **Convert Audio menyediakan pengaturan sample rate.** (#561)
- **Admin dapat melonggarkan panjang kata sandi minimum**, hingga 1 untuk instance LAN tepercaya. (#543)
- **MFA bersifat swalayan**, penguncian kebijakan sudah ditutup, dan login OIDC atau SAML mendapat challenge MFA yang sebenarnya alih-alih blokir keras. (#531, #536)
- **`Error: Error` polos kini menyebutkan penyebabnya.** Kegagalan encode Sharp, keluarnya sidecar AI, keluaran sidecar dokumen non-JSON, dan kegagalan penghapusan latar belakang sebelumnya semuanya tiba dengan alasan yang dihapus. (#532, #534, #535, #538, #612)
- **Dialog bantuan sudah diterjemahkan.** Label pintasan dan teks memulai-nya sebelumnya hardcode bahasa Inggris sementara terjemahan yang sudah jadi tidak terpakai di ke-21 file locale. (#647)

### Perbaikan Bug {#v2-2-0-bug-fixes}

- **File HEIC iPhone ditolak** sebagai tidak terbaca sebelum mencapai dekoder yang menanganinya. (#631)
- **Preset konversi gagal pada file kedua**: jpg-to-pdf dan saudara image-to-pdf-nya, ditambah pdf-to-png, pdf-to-jpg, dan pdf-to-tiff, semuanya mengembalikan `Tool not found` begitu Anda mengunggah dua file. (#633, #643)
- **Preset konversi PDF kehilangan tombol unduhnya.** (#629)
- **Timeout pemrosesan tanpa batas tidak dihormati**, dan aliran progres yang macet kini pulih alih-alih membiarkan antarmuka menunggu. (#638)
- **Unduhan menggantung alih-alih gagal** ketika file tersimpan ternyata lebih pendek daripada panjang yang tercatat. (#617)
- **Alat halaman PDF gagal pada file pendek dan terenkripsi**: Remove Pages secara default memakai rentang halaman yang tidak dimiliki dokumen di bawah enam halaman mana pun, dan PDF yang dilindungi kata sandi gagal secara samar di dalam worker. (#594)
- **PDF to Text diam-diam mengembalikan file kosong** untuk PDF hasil pindai. Kini ia mengarahkan Anda ke OCR dan menyajikan teks sebagai UTF-8. (#603)
- **PDF to Word menghilangkan blok teks berwarna** dan memecahnya di seluruh halaman. (#500)
- **Object Eraser meninggalkan sisa hantu** dan mengaburkan objek kecil pada gambar beresolusi tinggi. (#501)
- **Stabilize Video menulis keluaran yang tidak dapat diputar** tanpa faststart. (#593)
- **Perbaikan editor gambar**: rotate, flip, resize, levels, curves, filter, dan kunci layer. (#597)
- **Sign PDF menampilkan kanvas kosong** alih-alih melaporkan mengapa PDF gagal dimuat. (#545)
- **Pustaka file mencatat dimensi 0x0** dan melewati pratinjau untuk unggahan HEIC, RAW, dan PSD. (#636, #637)
- **Memasang lebih dari satu bundel AI** membuat virtualenv bersama bermulti-versi dan diam-diam merusak tiga alat. (#649)
- **Konversi ke JXL pada kualitas 1 hingga 4 mengembalikan 500**, dan ffmpeg yang hilang dilaporkan kepada Anda sebagai unggahan yang rusak. (#649)
- **Gangguan Postgres sementara menelantarkan job yang selesai**, meninggalkan keluaran di disk tanpa baris yang menunjuk ke sana. Reconciler kini mengadopsi pekerjaan itu alih-alih membuangnya. (#649)
- **Endpoint Redis yang berubah alamat membuat setiap consumer macet** sementara health check tetap menjawab 200. (#649)
- **Perbaikan situs web dan dokumentasi**: tautan terlokalisasi tidak lagi menghilangkan fragmen `#` atau mengubah `zh-CN` menjadi huruf kecil, navigasi dokumentasi tetap di dalam viewport pada tablet, dan kedua situs tidak lagi memanggil API GitHub dari browser Anda. (#516, #562, #570, #560)

### Catatan Upgrade {#v2-2-0-upgrade-notes}

Tidak ada yang perlu dimigrasikan, tetapi dua default bawaan berubah:

- **`TRUST_PROXY` kini default ke `loopback,linklocal,uniquelocal`** alih-alih memercayai setiap peer. Jaringan bridge Docker dan Compose berada di dalam rentang itu, jadi sebagian besar setup tidak perlu perubahan. Jika reverse proxy Anda menjangkau SnapOtter dari alamat publik, atur `TRUST_PROXY` secara eksplisit, atau pembatasan laju dan log audit akan mengaitkan setiap permintaan ke proxy.
- **`MAX_AI_JOBS_PER_USER` default ke 5** job AI satu-file yang sedang berjalan per pengguna. Proses AI batch dan pipeline tetap tanpa batas.

Opsi opsional baru: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (nonaktif secara default), dan `GIF_BG_MAX_FRAMES`.

### Ucapan Terima Kasih {#v2-2-0-acknowledgements}

Sebagian besar rilis ini bermula dari laporan bug orang lain.

Kode dan kontribusi:

- **@mvanhorn** ❤️: Menulis ulang kegagalan timeout remove-background menjadi pesan yang menyebutkan apa yang harus dilakukan, alih-alih timeout polos. (#518, #494)
- **@EuanTop** ❤️: Memulihkan aksi unduh pada halaman preset konversi PDF dengan membuat rute sinkron mengembalikan kontrak hasil alat standar. (#629, #623)
- **@harshjainnn** ❤️: Mendiagnosis unduhan yang dimulai tetapi tidak pernah selesai, dan mengusulkan arah socket-reset yang menjadi dasar perbaikannya. (#617, #590)

Pengungkapan keamanan:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Mengungkapkan secara privat eskalasi hak istimewa melalui role `users:manage` yang didelegasikan, dengan analisis lengkap dari sumber ke sink dan rantai eksploit yang berfungsi. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Mengungkapkan IDOR terautentikasi pada pembatalan job, dan path traversal pada nama file tersimpan Pustaka yang dapat dijangkau setelah impor SQLite 1.x berbahaya, dengan proof of concept yang berfungsi untuk masing-masing. (#599, #600)

Laporan bug:

- **@riz467** ❤️: File HEIC iPhone asli ditolak saat validasi, dengan akar masalah yang sudah ditelusuri dalam laporan. (#622)
- **@coupej** ❤️: Halaman preset PDF menggantung selamanya, dan jpg-to-pdf gagal begitu file kedua ditambahkan. Dua bug yang berbeda, dipisahkan dengan benar. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` didokumentasikan sebagai tanpa batas tetapi dibatasi lima menit. (#630)
- **@bezibaerchen** ❤️: Convert Audio menyembunyikan pengaturan sample rate yang dijanjikan deskripsinya sendiri. (#558)
- **@hell-toupee** ❤️: Bundel OCR akurat gagal dipasang dengan error `libpaddle`. (#505)
- **@Michael1260** ❤️ dan **@And-CSH** ❤️: Mengonfirmasi kegagalan instalasi OCR itu secara independen dan menetapkan bahwa ekstraksi manual berfungsi sementara installer dalam aplikasi tidak, yang mempersempit bug ke installer. (#505)
- **@TomErnst1972** ❤️: Mengaktifkan kebijakan wajib-MFA mengunci admin dari instance miliknya sendiri. (#515)
- **@thokich** ❤️: Penghapusan objek menghasilkan isian yang buram dan tidak dapat dipakai, yang mendorong penulisan ulang inpainting HD dan bundel kualitas tinggi opsional. (#141)
- **@Hennie-git** ❤️: Instalasi Proxmox LXC restart 76 kali terhadap Postgres yang belum menerima koneksi. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Memilah laporan itu secara real time dan menghasilkan diagnosis yang menjadi dasar perbaikan startup. (#537)

Permintaan fitur dan masukan:

- **@LECOQQ** ❤️: Meminta pelonggaran kompleksitas kata sandi pada instalasi home-server. (#136)
- **@killervette42** ❤️: Meminta Unraid Community App, kini diterbitkan ke toko Unraid CA. (#96)
- **@alienatedsec** ❤️: Menunjukkan bahwa perbaikan fallback GPU ke CPU terkubur dalam issue yang sudah ditutup dan tidak dapat ditemukan, itulah sebabnya kini ada di dokumentasi deployment. (#490, #587)
- **@neilp316** ❤️: Mengonfirmasi kegagalan GPU Blackwell pada RTX 5060 dan memetakan jalur upgrade CUDA 12.8 yang berfungsi. (#120)
- **@Roiki11** ❤️: Mengusulkan penyimpanan bersama dengan referensi path dibandingkan transfer file lewat HTTP untuk komputasi AI di luar kotak. (#189)

Terima kasih juga kepada anggota komunitas yang melaporkan hal-hal ini lewat Discord dan email, yang namanya tidak kami catat: permintaan crop squircle (#602), unduhan image-to-PDF yang dimulai tetapi tidak pernah selesai (#604, #607), alat Delete Pages yang macet (#594), teks Arab yang hilang dari pdf-to-text (#603), dan diagnosis di balik fallback GPU ONNX (#490).

[Selisih lengkap di GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 mengubah toolkit gambar menjadi suite manipulasi file yang lengkap: 200+ alat di lima modalitas (Gambar, Video, Audio, PDF, dan File), dibangun ulang di atas Postgres 17 dan antrean job berbasis Redis, dengan `docker run` satu perintah. Ini adalah rilis mayor; baca Perubahan yang merusak sebelum meningkatkan dari 1.x.

### Fitur baru {#new-features}

- **Empat modalitas alat baru**: Video, Audio, PDF, dan File bergabung dengan Gambar, membawa katalog ke 200+ alat.
- **Job latar belakang yang tahan lama**: Antrean berbasis Redis (BullMQ) menjalankan setiap alat sebagai job yang terlacak dengan progres SSE langsung.
- **Mode satu container all-in-one**: Satu `docker run` menjalankan instance lengkap dengan Postgres dan Redis bawaan.
- **Bundel AI sesuai permintaan**: Penghapusan latar belakang, OCR, transkripsi, upscaling, deteksi dan peningkatan wajah, object eraser, colorize, dan pemulihan foto dipasang dari UI. Akselerasi GPU dideteksi per framework.
- **Sign PDF**: Gambar, ketik, atau unggah tanda tangan dan letakkan pada PDF di browser.
- **Automate**: Pembuat pipeline visual yang merangkai alat, dengan sembilan templat siap pakai.
- **83 preset konversi satu klik**: Konverter khusus seperti JPG-ke-PNG, MP4-ke-GIF, dan sejenisnya dengan pencarian fuzzy.
- **Editor gambar berbasis layer**: Editor berbasis Konva di `/editor` dengan kuas, bentuk, penyesuaian, filter, dan kurva.
- **Pustaka file**: Simpan hasil apa pun dan gunakan kembali sebagai input untuk alat lain.
- Alat yang disematkan, zoom dan pan di dalam kanvas, 21 bahasa, dan kemampuan enterprise (OIDC/SSO, SAML, SCIM, penyimpanan S3, izin per alat, ekspor audit, distributed tracing).

### Peningkatan {#improvements}

- Batalkan proses yang sedang berjalan. (#137)
- Dekode RAW resolusi penuh melalui LibRaw, termasuk DNG. (#289)
- Deployment non-root dan UID asing (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Deteksi instalasi AI yang akurat dan alur instalasi yang diperkuat. (#214, #352)
- Penguatan privasi: tidak ada egress pihak ketiga otomatis, ditambah mode strict-offline opsional.
- Tombol masukan yang selalu aktif, bahkan saat analitik dimatikan.

### Perbaikan bug {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` kembali menonaktifkan pembatasan laju untuk rute alat. (#271)
- Memperbaiki path virtualenv AI di dalam image Docker. (#390)
- Kompatibilitas sharp 0.35.2+. (#362)
- Perbaikan tata letak editor gambar: penggaris, perilaku isian, sidebar, dan ukuran kanvas. (#258, #259)
- Menyelesaikan terjemahan bahasa Italia. (#231, #206, #425)
- Audio normalize dan loudnorm mempertahankan sample rate sumber.
- Penguatan SSRF: pencocokan CIDR IPv6 numerik dan pra-pindai URL yang diperluas. (#287)
- PDF yang dihasilkan diberi cap SnapOtter sebagai Producer.
- mediapipe terpasang di Python 3.13 dan Debian 13.

### Perubahan yang merusak {#breaking-changes}

2.0 mengganti database SQLite bawaan dengan Postgres 17 dan menambahkan Redis 8 untuk antrean job. Data 1.x Anda dimigrasikan secara otomatis pada boot pertama, tetapi stack container berubah, jadi cadangkan seluruh volume `/data` Anda terlebih dahulu (1.x menjalankan SQLite dalam mode WAL, sehingga data yang ter-commit biasanya berada di `snapotter.db-wal`). Lalu pilih image satu container (Postgres dan Redis bawaan, hanya root) atau stack Compose (aplikasi plus Postgres 17 dan Redis 8). Lihat [panduan migrasi](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) dan [panduan upgrade](/id/guide/upgrading).

### Upgrade {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Atau dengan Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Selisih lengkap di GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Alat HTML to Image baru, aksesibilitas WCAG 2.2 AA, penguatan keamanan dari penetration testing, dan 5 perbaikan Docker yang kritis.

### Fitur baru {#new-features-1}

- **HTML to Image**: Tangkap tangkapan layar URL atau HTML mentah sebagai PNG/JPEG/WebP. Tangkapan halaman penuh, viewport kustom, mode gelap.
- **Konvensi secret Docker _FILE**: Pasang variabel env sensitif sebagai file alih-alih teks biasa. (#205)
- **Lisensi enterprise dan penyimpanan S3**: Kunci lisensi komersial opsional dan penyimpanan objek yang kompatibel dengan S3.
- **Peningkatan editor bentuk**: Transparansi isian/garis, pemilih warna RGBA, gaya garis putus-putus.
- **Arsip rilis siap pakai**: Unduh tarball dari GitHub Releases untuk instalasi non-Docker (Proxmox, bare metal, LXC). (#202)

### Peningkatan {#improvements-1}

- **Aksesibilitas WCAG 2.2 AA**: Lewati navigasi, focus trapping, region aria-live, dukungan reduced motion, rasio kontras yang benar. (#209)
- **Responsivitas seluler**: Pengaturan responsif, SSE menyambung ulang otomatis saat berpindah tab di seluler. (#203, #204)
- **Kualitas penghapusan latar belakang**: Penghalusan tepi, dekontaminasi warna, pemilihan format keluaran.
- **Terjemahan Italia**: ~145 string baru oleh @albanobattistella. (#206)
- **Dokumentasi API per alat**: 53 halaman dokumentasi dengan parameter, contoh, dan format respons.
- **Unduhan model AI**: Logika coba ulang dengan exponential backoff untuk HuggingFace. (#201)

### Perbaikan bug {#bug-fixes-1}

- Container Docker baru sama sekali tidak dapat digunakan (pembatasan laju memblokir semua permintaan).
- Alat AI deteksi wajah (blur-faces, red-eye-removal, enhance-faces, passport-photo) gagal di semua platform.
- File HEIC rusak di ARM (ketidakcocokan simbol libheif).
- Bundel AI upscale dan restore-photo gagal dipasang di ARM.
- OCR memakai versi CUDA yang salah pada container GPU.
- Bypass penjaga SSRF melalui alamat IPv6 yang dipetakan IPv4 heksadesimal. (Kredit: @tonghuaroot)
- Dekode HEIC iPhone dengan gambar pendamping. (#183, #199)
- Real-ESRGAN CUDA OOM pada GPU 8GB. (#200)
- 6 error Sentry produksi dan 7 bug QA. (#208)

### Keamanan {#security}

- 10 temuan penetration test ditangani (bypass XFF, crash JSON yang salah format, pipeline tanpa batas, XSS log audit, metode TRACE, dan lainnya). (#207)
- Bypass IPv6 heksadesimal SSRF diblokir. (Kredit: @tonghuaroot)
- Image dasar Dockerfile dipin berdasarkan digest.

### Upgrade {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Atau dengan Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Selisih lengkap di GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Demo langsung, halaman landing per alat, dan sejumlah perbaikan penyempurnaan.

### Fitur baru {#new-features-2}

- **Demo langsung** - [demo.snapotter.com](https://demo.snapotter.com) memungkinkan orang mencoba SnapOtter tanpa menginstal apa pun.
- **Halaman indeks alat** - Jelajahi semua 50+ alat di `/tools` dengan pencarian dan filter kategori.
- **50+ halaman landing SEO** - Setiap alat kini memiliki halaman landing khusus dengan FAQ, kasus penggunaan, dan tabel perbandingan.
- **Pratinjau latar belakang** - Slider sebelum-sesudah menampilkan latar belakang kotak-kotak di belakang gambar transparan.
- **Pembuat kata sandi kuat** - Tombol satu klik di formulir Tambah Anggota.

### Perbaikan bug {#bug-fixes-2}

- Alat info HEIC/HEIF tidak lagi gagal (pra-dekode ditambahkan).
- Instalasi bundel model AI menampilkan pesan error yang lebih baik dan menghormati batas sumber daya.
- Thumbnail Pustaka dimuat dengan benar (header autentikasi sebelumnya hilang).
- Menu dropdown tidak lagi terpotong di tabel pengaturan Orang dan Tim.
- Persentase perbandingan ukuran disembunyikan pada alat non-kompresi.
- Tautan kebijakan privasi ganda dihapus.
- Terjemahan Italia ditambahkan untuk pengaturan fitur AI.
- Ikon Lucide yang diganti namanya diperbarui (Wand2, Columns).

### Infrastruktur {#infrastructure}

- OpenSSF Scorecard diperkuat dari 4,3 menjadi ~7,0.
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

[Selisih lengkap di GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Lima alat baru, editor gambar lengkap, login SSO, 20 bahasa. Mungkin seharusnya dipecah menjadi tiga rilis terpisah, tetapi begitulah adanya.

### Fitur baru {#new-features-3}

- **Editor gambar** - Layer, kuas, bentuk, penyesuaian, filter, kurva, pintasan keyboard. Berjalan di browser Anda, memproses di perangkat keras Anda.
- **Autentikasi OIDC / SSO** - Login dengan Google, GitHub, Okta, atau penyedia OpenID Connect apa pun. Atur beberapa variabel env dan tim Anda memakai akun yang sudah ada.
- **Pembuat meme** - 100 templat bawaan dengan perenderan teks melalui opentype.js. Atau unggah gambar Anda sendiri.
- **Beautify** - Masukkan tangkapan layar, dapatkan gambar yang dipoles. Bingkai perangkat (macOS, Windows, browser), bayangan, gradien, preset media sosial.
- **Simulasi buta warna** - Pratinjau tampilan gambar dengan protanopia, deuteranopia, tritanopia, dan gangguan penglihatan warna lainnya.
- **Perbaikan transparansi PNG** - Mendeteksi PNG yang transparan palsu dan memperbaikinya dengan BiRefNet HR-matting. Penghapusan watermark opsional melalui inpainting LaMa.
- **Perluasan kanvas AI** - Perluas batas gambar dengan isian AI. Tiga tingkat kualitas (cepat, seimbang, kualitas) tergantung berapa banyak waktu GPU yang ingin Anda korbankan.
- **20 bahasa** - Arab, Tionghoa (Sederhana/Tradisional), Ceko, Belanda, Prancis, Jerman, Hindi, Indonesia, Italia, Jepang, Korea, Polandia, Portugis, Rusia, Spanyol, Thai, Turki, Ukraina, Vietnam. RTL berfungsi untuk bahasa Arab.
- **Impor URL** - Tempel URL ke dropzone atau impor massal dari daftar. Pengambilan di sisi server dengan perlindungan SSRF.
- **Penghapus multi-file** - Gambar mask penghapusan di beberapa gambar, proses semuanya dengan satu klik. Goresan tersimpan per gambar.
- **Impor/ekspor pipeline** - Simpan rangkaian alat sebagai JSON, bagikan kepada orang lain.
- **17 format RAW kamera baru** melalui exiftool, ditambah input QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ, dan APNG. Codec keluaran baru untuk BMP, ICO, JP2, QOI. Ekspor AVIF, TIFF, GIF, JXL, dan PSD dipulihkan dari branch yang sebelumnya hilang.

### Peningkatan {#improvements-2}

- **Peningkatan gambar** - Mengganti pipeline lama dengan CLAHE + normalise + gamma. Toggle Deep Enhance yang baru memakai model AI untuk hasil yang lebih agresif.
- **Restore photo** - Deteksi goresan ditulis ulang dengan pemfilteran Otsu 8 sudut. Inpainting LaMa kini berjalan pada resolusi asli.
- **Format eksotis di mana-mana** - OCR, image-to-PDF, generator favicon, composition, stitch, dan vectorize kini semuanya mendekode HEIC, RAW, PSD.
- **Compress** - Toleransi ukuran target diperketat dari 5% menjadi 1%. Ukuran target adalah mode default. Menambahkan tombol stepper dan pemilih satuan KB/MB.
- **Pembersihan Sentry** - 644 event yang tidak dapat ditindaklanjuti difilter. Error yang sebenarnya kini ditangani dengan benar.
- **Deteksi GPU** - Diagnostik yang lebih baik untuk container yang memiliki CUDA tetapi tidak memiliki nvidia-smi.
- **Mode autentikasi nonaktif** - Pengguna anonim di-seed di DB dengan role admin. Kunci API, pipeline, dan file pengguna tidak lagi rusak karena constraint FK.
- **2.705+ tes baru** di unit, integrasi, dan E2E.

### Perbaikan bug {#bug-fixes-3}

- Upscale di CPU tidak lagi timeout pada kotak NAS dan perangkat keras berdaya rendah.
- Logo kode QR tidak lagi membuat pratinjau hilang secara permanen.
- Overflow crop diperbaiki untuk gambar potret yang tinggi.
- File TIFF beralpha dengan benar memaksa keluaran PNG alih-alih menghasilkan korupsi.
- Dekode HDR/EXR dikonversi ke 8-bit sebelum CLAHE, memperbaiki kegagalan dekode.
- Buffer input face landmarks dikonversi ke PNG sebelum sidecar Python, memperbaiki crash.
- Find duplicates menangani batch dengan format campuran dan error jaringan.
- Pratinjau Beautify diperbarui secara real time.
- Bilah progres untuk stitch dan vectorize.
- SVGZ ditangani oleh SVG-to-raster.
- Nama file non-ASCII diperbaiki melalui header X-File-Results yang dikodekan persen.

### Upgrade {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Atau dengan Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Selisih lengkap di GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Image Docker terpadu dengan deteksi otomatis GPU. Satu image menangani beban kerja CPU maupun GPU. Compose disederhanakan menjadi satu file dengan rotasi log. Pra-unduhan model kini menyertakan verifikasi dan smoke test.

---

## v1.13.0 {#v1-13-0}

Kontrol akses berbasis peran (RBAC). 14 izin granular, tiga role bawaan (admin, editor, user), dukungan role kustom. Pemeriksaan izin pada semua rute API. Tab frontend difilter berdasarkan izin pengguna.

---

## v1.12.0 {#v1-12-0}

Alat PDF to Image. Konversi halaman PDF ke PNG, JPEG, WebP, atau TIFF pada DPI kustom. Image Docker terpadu dengan deteksi otomatis GPU.

---

## v1.11.0 {#v1-11-0}

llms.txt yang dibuat otomatis melalui vitepress-plugin-llms untuk dokumentasi yang ramah AI.

---

## v1.10.0 {#v1-10-0}

Content-aware resize (seam carving) dengan perlindungan wajah. Ubah ukuran gambar sambil mempertahankan konten penting.

---

## v1.9.0 {#v1-9-0}

Alat Stitch / Combine. Gabungkan gambar berdampingan, ditumpuk secara vertikal, atau dalam grid kustom.

---

## v1.8.0 {#v1-8-0}

Alat Edit Metadata. Lihat dan edit metadata EXIF, IPTC, dan XMP dengan antarmuka strip/keep yang granular.

---

## Rilis lama {#older-releases}

Untuk changelog tingkat commit lengkap termasuk rilis patch, lihat [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
