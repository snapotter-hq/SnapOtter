---
description: "Catatan rilis dan riwayat versi untuk SnapOtter. Lihat apa yang baru, ditingkatkan, dan diperbaiki di setiap rilis."
i18n_source_hash: 952098c65251
i18n_provenance: human
i18n_output_hash: 318966c81746
i18n_hash_version: 2
---

# Changelog {#changelog}

## v2.3.0 {#v2-3-0}

SnapOtter baru saja melewati satu juta pull image di Docker Hub dan GHCR, serta 3.000 bintang di GitHub. Itu berarti banyak sekali server self-hosted, jadi rilis ini adalah ucapan terima kasih kami untuk semua yang menjalankannya.

Segera upgrade. 2.3.0 menutup enam advisory keamanan, salah satunya dengan tingkat keparahan tinggi. Detailnya ada di bagian Keamanan di bawah.

Selain perbaikan, ada tool baru: editor halaman PDF Multi-Tool, preset kompres ke ukuran target sekali klik untuk gambar dan PDF, serta pengurutan halaman dengan drag-and-drop di Organize PDF. OCR kini bisa membaca bahasa Arab, dan pdf-to-text menawarkan OCR saat menemukan PDF hasil pindaian. SnapOtter bisa berjalan di bawah subpath seperti `/snapotter` di belakang reverse proxy. Aplikasi tidak lagi membutuhkan superuser Postgres untuk berjalan. Admin yang terkunci bisa memulihkan akses dari command line. Sisanya sekitar 1.400 perbaikan, sebagian besar untuk masalah yang Anda laporkan.

> [!IMPORTANT]
> Keenam advisory di bawah memengaruhi 2.2.0, dan sebagian berlaku sampai 2.0.0. Jika Anda berbagi instance dengan pengguna lain atau mengeksposnya di luar jaringan Anda sendiri, lakukan upgrade.

### Keamanan {#v2-3-0-security}

- **Upload SVG bisa melewati sanitasi (GHSA-9c7h-xjrp-8gh3, tinggi).** SVG yang ditolak decoder gambar disimpan dan disajikan apa adanya, bukan disanitasi. Terdampak: 2.2.0 dan sebelumnya. Dilaporkan oleh @xaferima. (#1211)
- **Stream progres job tidak memeriksa siapa yang meminta (GHSA-ff22-w6x2-fm98, sedang).** Sekarang stream ini mewajibkan login dan kepemilikan job. Terdampak: 2.0.0 sampai 2.2.0. (#1750)
- **Link unduhan hasil juga menyajikan file upload asli (GHSA-jgv3-2jc6-f628, sedang).** Terdampak: 2.2.0 dan sebelumnya. Dilaporkan oleh @emirhancatkin. (#3623)
- **Foto paspor dan efek latar belakang memercayai job id yang dikirim klien (GHSA-3c8g-8v4x-qq9j, sedang).** Terdampak: 2.2.0 dan sebelumnya. Dilaporkan oleh @shaoyuuuuu. (#3623)
- **Impor URL, upload, dan pratinjau melewati pemeriksaan izin role dan API key (GHSA-8xxr-g2w8-7f9r, sedang).** Terdampak: 2.2.0 dan sebelumnya. Dilaporkan oleh @nguyenvantiennani. (#3780, #707)
- **Penegakan SSO membocorkan username break-glass (GHSA-q6fg-vvw9-cr8r, rendah).** Login lokal yang ditolak kini mendapat 401 yang sama dengan login gagal lainnya. Terdampak: 2.0.0 sampai 2.2.0. (#2148)
- **Postgres tidak lagi berjalan sebagai superuser.** Aplikasi kini terhubung dengan role yang hanya bisa membaca dan menulis data. Migrasi memakai koneksi terpisah yang opsional. Lihat Catatan Upgrade. (#918)
- **Dependensi yang ditambal**: batas minimum override dompurify dan handlebars dinaikkan ke versi yang sudah diperbaiki. (#4247)

### Fitur Baru {#v2-3-0-new-features}

- **PDF Multi-Tool**: editor halaman yang bisa mengurutkan ulang, menduplikasi, memutar, dan menghapus halaman, serta menarik halaman dari PDF lain. Server merakit file akhirnya. (#1338)
- **Kompres ke ukuran target sekali klik**: lima preset gambar (20, 50, 100, 200, 500 KB) dan lima preset PDF (100, 200, 500 KB, 1 MB, 2 MB). (#1250, #1377)
- **Jalankan SnapOtter di bawah subpath**: atur `BASE_PATH=/snapotter` dan image yang sama melayani dari sana. Link hasil, cookie, redirect SSO, dan dokumentasi API semuanya mengikuti. (#1252, #1324)
- **OCR bahasa Arab**: pilih bahasa Arab secara eksplisit, atau biarkan mode otomatis mendeteksinya. Berlaku untuk OCR gambar dan PDF. (#4130, #4183)
- **pdf-to-text menawarkan OCR** saat sebuah PDF, atau seluruh batch, tidak punya lapisan teks, alih-alih mengembalikan file kosong. (#4142, #4198)
- **Pengurutan halaman dengan drag-and-drop di Organize PDF**, dengan mouse maupun sentuhan. (#1249, #2601)
- **Urutkan ulang file sebelum menjalankan tool multi-file**: merge, stitch, collage, dan tool multi-file lainnya mempertahankan urutan yang Anda atur. (#756, #757)
- **Batalkan batch dan pipeline**, dan pekerjaannya benar-benar berhenti di server. (#807)
- **Perintah pemulihan `snapotter-admin`**: `reset-password`, `create-admin`, `unlock-user`, dan reset MFA, untuk admin yang terkunci dari web UI. (#4016)
- **Pendaftaran MFA saat login**: jika MFA diwajibkan, pengguna yang belum memilikinya langsung menyiapkannya di tempat alih-alih diblokir.
- **Ambil foto dari kamera dan aplikasi yang bisa diinstal**: ambil foto langsung ke dalam tool di ponsel, dan instal SnapOtter sebagai PWA. (#773)
- **Padding transparan di dialog Canvas Size editor.** (#4111)
- **Pemberitahuan update untuk admin**: saat versi SnapOtter yang lebih baru tersedia, admin melihat pemberitahuan yang bisa ditutup dengan link ke catatan rilis. Pemeriksaannya lewat koneksi analytics yang sudah ada, jadi nonaktif saat analytics dimatikan.

### Peningkatan {#v2-3-0-improvements}

- **Hapus latar belakang lebih cepat pada run berulang**: model tetap dimuat di antara request alih-alih dimuat ulang setiap kali. (#4144)
- **Upload batch memakai memori jauh lebih sedikit**: setiap file ditulis ke disk sementara dan diproses satu per satu alih-alih menumpuk di RAM. (#2687)
- **Instalasi bundle AI gagal dengan bersih dan melakukan rollback** alih-alih meninggalkan venv yang setengah terpasang. Instalasi hapus latar belakang di Proxmox LXC kembali berfungsi, dan host dengan memori kecil mendapat batas CPU yang masuk akal sebelum job dimulai. (#2628, #2597, #2526, #2546)
- **Deteksi GPU lebih andal**: CUDA dideteksi lewat driver, kartu seri RTX 50 beralih ke CPU alih-alih gagal, dan encoder video hardware diuji dulu sebelum dipakai. (#4225, #4075, #3980, #3983)
- **`MAX_WORKER_THREADS` kini berfungsi**. Sebelumnya nilainya dibaca tetapi tidak pernah diterapkan. (#3249)
- **Tool yang berjalan lama mendapat timeout panjang**: pdf-to-word, compress-pdf, convert-document, dan content-aware resize tidak lagi timeout terlalu cepat pada file besar. (#3276)
- **Compress PDF menjaga hasil pindaian tetap terbaca**, dan memberi tahu saat ukuran target tidak bisa dicapai alih-alih menghasilkan file yang tidak terbaca. (#4112)
- **Login gagal dibatasi per username**: lebih dari sepuluh kali dalam lima belas menit mendapat 429 dengan `Retry-After`. (#827)
- **Pesan error menjelaskan apa yang salah**: binary yang hilang, gangguan storage, proses yang dimatikan karena kehabisan memori, dan batas upload kini mendapat pesan yang spesifik alih-alih sekadar 500 atau 422.
- **Audit log mencakup run tool, batch, dan pipeline**, dan event pengguna, role, tim, serta GDPR mencatat siapa melakukan apa kepada siapa. (#3991, #3984)
- **Container all-in-one berhenti saat boot pertama gagal** alih-alih restart terus-menerus, dan Postgres serta Redis embedded punya batas waktu startup. (#3008, #1130)
- **Tanggal dan bentuk jamak mengikuti bahasa Anda**, dan string bahasa Inggris terakhir yang di-hardcode sudah diterjemahkan.
- **Penyempurnaan mobile dan editor**: tata letak slider, Sign PDF, dan crop di ponsel, drag dengan sentuhan, kuas piksel yang lebih cepat, serta Levels dan Curves di undo dan autosave.

### Perbaikan Bug {#v2-3-0-bug-fixes}

- **Adjust Colors salah menggabungkan pengaturan**: temperature, saturation, hue, contrast, dan sepia saling menimpa alih-alih bertumpuk. (#3153, #3120, #3469)
- **Pixelate tidak membuat piksel**, dan output PNG diam-diam direduksi ke palet di berbagai tool gambar. (#709, #716)
- **GIF dan WebP animasi kehilangan frame** di beberapa tool, dan palet serta transparansi GIF keluar salah. (#1184, #1225, #3407, #2573)
- **Upload yang diputar kehilangan kualitas**: auto-orient membuang encoding lossless, transparansi, dan kedalaman 16-bit. WebP animasi kini memutar setiap frame. (#2384, #2529)
- **TIFF dengan transparansi, file HEIF AV1, dan beberapa format RAW** gagal atau kehilangan alpha. (#2609, #2572, #1120)
- **Mengubah ukuran canvas editor ikut menskalakan gambar** alih-alih menambah ruang di sekelilingnya. (#2081)
- **Nama file output rusak**: `.jpeg` dan `.tif` berubah menjadi ekstensi lain, dan dotfile atau nama yang mengulang ekstensinya jadi rusak. (#3495, #3382)
- **Auto-save library mengabaikan kuota storage**, dan penghitung storage bisa menjadi negatif. (#2389, #2585)
- **Job yang macet setelah restart** kini diselesaikan saat startup alih-alih menampilkan "processing" selamanya. (#3219, #3193)
- **Login OIDC menamai setiap pengguna baru "admin"**, dan login di Safari iOS berakhir di halaman error meski sudah berhasil. (#862, #4021)
- **Aturan password yang dinonaktifkan tetap diberlakukan** saat membuat pengguna. (#1028)
- **PDF yang rusak menggantung selama 30 detik** sebelum gagal. (#920)
- **Pemeriksaan disk bundle AI meminta sekitar 18 GB** untuk menginstal satu bundle. (#1248)
- **Compress Video gagal pada rekaman layar dengan frame rate variabel.** (#2427)
- **Hapus latar belakang batch kehilangan hasil yang sudah selesai** saat browser mengulang request. (#2015)
- **Field angka di Settings tidak bisa dikosongkan** saat mengetik. (#1449)
- **Mematikan analytics masih menyisakan event antrean yang terkirim** sekitar 30 detik kemudian. Sekarang event itu dibuang saat Anda opt out. (#4270)

### Catatan Upgrade {#v2-3-0-upgrade-notes}

Migrasi berjalan sendiri saat startup. Anda tidak perlu menjalankan SQL apa pun.

- **Role database.** File Compose kanonis kini memberi aplikasi role yang hanya bisa membaca dan menulis data (`DATABASE_URL`) dan koneksi privileged terpisah (`DATABASE_MIGRATION_URL`) yang hanya dipakai saat boot untuk migrasi dan grant. File Compose yang sudah ada tetap berjalan seperti sebelumnya: biarkan `DATABASE_MIGRATION_URL` tidak diatur dan SnapOtter berjalan dengan satu role. Untuk deployment non-lokal, atur `POSTGRES_APP_PASSWORD` bersama `POSTGRES_PASSWORD`.
- **Pemeriksaan startup lebih ketat.** Kesalahan ini dulu baru gagal belakangan, atau diam-diam. Sekarang container berhenti dengan pesan yang menyebut nama variabelnya: `DEFAULT_LOCALE` yang tidak didukung (pakai kode yang didukung seperti `de`, bukan `de_DE`), `SAML_IDP_SSO_URL`, `SAML_CALLBACK_URL`, atau `OIDC_ISSUER_URL` yang formatnya salah saat SSO aktif, daftar `TRUST_PROXY` yang tidak valid, `BASE_PATH` yang salah, dan `LOG_DIR` yang tidak bisa ditulisi.
- **`TRUST_PROXY` tidak lagi menerima jumlah hop.** Angka seperti `TRUST_PROXY=2` kini menghentikan container saat startup alih-alih diam-diam tidak memercayai proxy apa pun. Isi dengan alamat proxy atau rentang bernama (default-nya `loopback,linklocal,uniquelocal`), `false` jika tidak ada yang mem-proxy SnapOtter, atau `true` hanya jika proxy yang Anda kendalikan berada di depan pada alamat publik. (#998)
- **`MAX_WORKER_THREADS` kini berlaku.** Jika Anda sudah mengaturnya dan tidak melihat perubahan sebelumnya, sekarang Anda akan melihatnya.
- **Kode status API.** Gangguan engine dan storage mengembalikan 503 `ENGINE_UNAVAILABLE` (endpoint batch dulu mengembalikan 422). Upload yang melebihi batas mengembalikan 413 (dulu 400). `clientJobId` yang formatnya salah mengembalikan 400 dan yang dipakai ulang 409 (dulu 500). Mengulang batch pipeline milik Anda sendiri mengembalikan 202. `mode=targetSize` tanpa `targetSizeKb` mengembalikan 400. Login lokal yang ditolak di bawah penegakan SSO mengembalikan 401, bukan 403 `SSO_ENFORCED`. Login yang dibatasi mengembalikan 429 `LOGIN_THROTTLED`. Hasil remove-background tidak lagi menyertakan `originalUrl`.
- **Variabel opsional baru**: `BASE_PATH`, `DATABASE_MIGRATION_URL`, `GDPR_EXPORT_TIMEOUT_MS` (default 15 menit, `0` menonaktifkan), `EMBEDDED_REDIS_TIMEOUT_S` (180), dan `EMBEDDED_POSTGRES_TIMEOUT_S` (600).
- **File Compose disertakan dalam rilis.** `docker-compose.yml` dan `docker-compose-gpu.yml` dilampirkan pada rilis ini, jadi Anda bisa mengunduhnya langsung dari halaman rilis.

### Ucapan Terima Kasih {#v2-3-0-acknowledgements}

Satu juta pull berarti banyak orang yang melaporkan bug, mengirim perbaikan, dan memberi tahu kami apa yang masih kurang. Rilis ini sebagian besar adalah hasil kerja mereka.

Kode dan kontribusi:

- **@zakka258** ❤️: Membangun editor halaman PDF Multi-Tool dan deployment di bawah subpath, dua fitur terbesar di rilis ini, termasuk test untuk auth dan SSO di bawah subpath. (#1338, #1252, #1324, #1295)
- **@akshat-lakhera** ❤️: Membangun preset gambar kompres ke ukuran target sekali klik, memperbaiki konkurensi dan pembersihan pratinjau, dan mencegah storage browser yang diblokir membuat spinner login macet. (#1250, #1368, #2359)
- **@ChrisCreatesNet** ❤️: Menambahkan pengurutan ulang halaman dengan drag-and-drop di Organize PDF, yang awalnya ia minta di Discussions. (#1249, #965)
- **@drakeo338** ❤️: Sepuluh perbaikan di seluruh stack, termasuk auto-orient yang mempertahankan format dan kualitas, grup SCIM yang dibuat dalam satu transaksi, instalasi AI di bawah cgroup v2, dan error 5xx yang tidak lagi tersamar sebagai 422. (#1229, #2014, #1638, #1667)
- **@SuranaSanyam** ❤️: Menambahkan padding canvas transparan ke editor, memperbaiki putusan ukuran target Compress PDF yang basi, dan memungkinkan update tim secara parsial. (#4111, #4112, #1906, #2366, #2367)
- **@thejdubb02** ❤️: Menghentikan instance self-hosted mengirim data heatmap, memvalidasi `TRUST_PROXY` saat startup alih-alih crash, dan memperbaiki penanganan nama grup SCIM dan timeout qpdf. (#1051, #1052, #1053, #993, #994)
- **@88subarno88** ❤️: Mengubah beberapa error 500 menjadi jawaban 400 dan 409 yang tepat untuk job id yang formatnya salah dan impor multipart, serta memperbaiki pengosongan field angka di Settings. (#1486, #1556, #1603, #1449)
- **@harshoutoftokens** ❤️: Membuat pembacaan barcode bekerja offline dengan membundel decoder-nya, memperbaiki pratinjau media yang menampilkan input, dan meningkatkan pencarian format. (#1401, #1512, #1388)
- **@darklabs9** ❤️: Melaporkan dan memperbaiki Compress Video yang gagal pada rekaman layar dengan frame rate variabel. (#2426, #2427)
- **@dvd233** ❤️: Membuka semua format RAW kamera yang didukung decoder, dan membuat tool favicon muncul di pencarian ICO. (#1120, #1121)
- **@bercedev** ❤️: Memperbaiki nama file yang stem-nya mengulang ekstensi, dan membuat AI melaporkan device yang benar-benar dipakainya. (#3382, #3613)
- **@pamod-madubashana** ❤️: Menerjemahkan judul MFA terakhir yang masih berbahasa Inggris dan menyambungkan string progres yang belum terpakai. (#1228, #1227)
- **@mvanhorn** ❤️: Memperbaiki alokasi username ganda saat login SAML. (#2640)
- **@peremunoz** ❤️: Mencegah pembuatan barcode menyembunyikan gangguan storage dan memori sebagai "Invalid text". (#4057)
- **@mayuriphad** ❤️: Memperbaiki crash pada header auth alert tersimpan yang formatnya salah. (#3080)
- **@DevShoaib78** ❤️: Memperbaiki penutupan polygonal lasso di editor. (#1207)
- **@dltsum** ❤️: Memindahkan tampilan progres ke katalog pesan bersama. (#1262)
- **@albanobattistella** ❤️: Perbaikan terjemahan. (#1024)
- **@shoaibyazdani** ❤️: Membuat ulang baseline visual macOS. (#2475)

Pengungkapan keamanan:

- **@xaferima** ❤️: Menemukan bahwa SVG yang ditolak decoder melewati sanitasi, dan menelusuri dampaknya bersama kami. (GHSA-9c7h-xjrp-8gh3, #1211)
- **@emirhancatkin** ❤️: Menemukan bahwa link hasil juga menyajikan file upload asli. (GHSA-jgv3-2jc6-f628, #3623)
- **@shaoyuuuuu** ❤️: Menemukan bahwa foto paspor dan efek latar belakang memercayai job id yang dikirim klien. (GHSA-3c8g-8v4x-qq9j, #3623)
- **@nguyenvantiennani** ❤️: Menemukan bahwa impor URL melewati pemeriksaan izin. (GHSA-8xxr-g2w8-7f9r, #3780)
- **tonghuaroot** ❤️: Melaporkan bypass IPv6 pada pemeriksaan alamat SSRF, lengkap dengan proof of concept yang berfungsi. Perbaikannya sudah rilis di 2.0.0, dan ucapan terima kasih ini sudah lama tertunda. (#287)

Laporan bug:

- **@kabo** ❤️: Contoh `docker-compose.yml` tidak berfungsi. (#1027)
- **@xromen** ❤️: PDF rusak yang menggantung sampai timeout qpdf 30 detik. (#920)
- **@snmabaur** ❤️: Login OIDC yang mengubah setiap nama profil menjadi "admin". (#862)
- **@CodecNomad** ❤️: Tool Blur yang menduplikasi gambar. (#829)
- **@ohora0923** ❤️ dan **@Alexis-VS-CSharp** ❤️: Pixelate yang tidak berfungsi. (#678, #775)
- **@mptpro** ❤️: Unduhan AI hapus latar belakang yang gagal. (#714)
- **@dominic427** ❤️: Mengubah ukuran canvas editor menskalakan gambar alih-alih memperluasnya. (#2016)
- **@CodeByToast** ❤️: Field angka di Settings yang tidak bisa dikosongkan. (#1186)
- **@gioxx** ❤️: Pemeriksaan disk bundle AI yang meminta sekitar 18 GB untuk satu bundle. (#1248)
- **@rekcodocker** ❤️ dan **@madmike970** ❤️: Instalasi bundle AI yang gagal di Proxmox LXC, dengan detail container yang membantu menemukan penyebabnya. (#1030, #352)
- **@wxf26054** ❤️: Aturan password yang dinonaktifkan tetap diberlakukan saat membuat pengguna. (#1028)
- **@ersil** ❤️: Safari iOS yang meminta callback OIDC dua kali dan berakhir di halaman error setelah login berhasil. (#4021)
- **@casi-3** ❤️: Hapus latar belakang batch yang kehilangan hasil selesai saat browser mengulang request, dengan diagnosis yang tepat. (#2015)
- **@killervette42** ❤️: Kegagalan GPU Blackwell di unRaid, yang menjadi dasar fallback CPU untuk seri RTX 50. (#120, #4075)

Permintaan fitur dan masukan:

- **@photoevents** ❤️: Mengukur bahwa hapus latar belakang menghabiskan sekitar 11 detik untuk memuat model dan 1 detik untuk inferensi, mengusulkan caching session, dan membagikan pengalamannya menjalankan cache sendiri. Itu menjadi session cache di rilis ini. (#768, #776, #4144)
- **@benbou8231** ❤️: Menunjukkan bahwa file yang diimpor masuk dalam urutan terbalik di tool multi-file, yang berujung pada fitur pengurutan ulang sebelum run. (#729, #756)
- **@cf3901646** ❤️: Menelusuri error produksi yang berisik ke kelas error Postgres 58 dan mengusulkan perbaikannya. Kami tidak bisa me-merge PR-nya tanpa CLA yang ditandatangani, jadi kami menulis perbaikan yang sama sendiri. (#4210, #4253)
- **@chiliec** ❤️: Menyadari bahwa auto-orient yang gagal ditelan diam-diam dan progres instalasi mengabaikan katalog terjemahan. Kedua usulan itu dirilis lewat PR maintainer. (#1266, #1416, #1258, #1262)
- **@wahajahmed010** ❤️: Mengusulkan single-flight untuk impor modul enterprise, perbaikan untuk request SCIM bersamaan yang tidak sepakat soal lisensi. (#1267, #1283)
- **@chenzeyan54-commits** ❤️: Menunjukkan bahwa panduan konfigurasi tidak pernah menyebut override binary engine atau `SNAPOTTER_HW_ACCEL`, yang kini sudah didokumentasikan. (#1312, #1696)
- **@aron-intframe** ❤️: Mereproduksi celah penanganan error exiftool di clone baru dan menemukan bahwa race pada path sementara lebih parah daripada yang dijelaskan di issue. (#3458)

Terima kasih juga kepada anggota komunitas yang melaporkan masalah-masalah ini lewat Discord dan email, yang namanya tidak kami catat.

[Diff lengkap di GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.2.0...v2.3.0)

---

## v2.2.0 {#v2-2-0}

Sebagian besar 2.2 berfokus pada penguatan. Seorang non-admin yang memegang role `users:manage` hasil delegasi dapat mengambil alih instance, dan ternyata setiap endpoint tool tidak memiliki pemeriksaan izin. Upgrade jika Anda menjalankan lebih dari satu pengguna.

Sisanya adalah berbagai masalah self-hosting: unduhan yang dimulai tetapi tidak pernah selesai, preset yang rusak begitu Anda menambahkan file kedua, kontainer yang crash-loop saat Postgres masih dalam proses startup. Dua tool baru juga hadir. Dokumentasi dan situs web kini diterjemahkan ke 21 bahasa, dan antarmuka akhirnya lolos kontras WCAG AA.

> [!IMPORTANT]
> Jika Anda memberikan `users:manage` kepada non-admin melalui role kustom, role itu dapat mengambil alih akun administrator pada 2.0.0 hingga 2.1.0. Detailnya di Keamanan.

### Keamanan {#v2-2-0-security}

- **Eskalasi hak istimewa melalui role `users:manage` yang didelegasikan (GHSA-9xgh-95qh-2x7h).** Pengguna non-admin yang memegang `users:manage` melalui role kustom dapat mereset kata sandi atau menghapus akun dengan hak istimewa lebih tinggi, termasuk administrator bawaan, dan mengambil alih instance. Reset kata sandi dan penghapusan akun kini memverifikasi otoritas pemanggil atas target, sehingga role yang didelegasikan tidak dapat melebihi tingkatnya sendiri. Terdampak: 2.0.0 hingga 2.1.0. Dilaporkan oleh 李春来 (Chunlai Li). (#616)
- **Setiap endpoint tool kini dijaga.** Akses tool diberlakukan per rute, jadi 45 rute yang ditulis tangan harus mengingat panggilan yang sama dan tidak ada yang melakukannya. Role tanpa `tools:use` masih dapat menjalankan image-to-pdf, erase-object, upscale, sign-pdf, dan lainnya. Pemeriksaan kini berada di satu preHandler yang dipicu oleh rute yang cocok, sehingga mencakup sub-jalur dan rute apa pun yang ditambahkan nanti. (#646)
- **Pembatasan laju dapat dilewati pada instalasi Docker.** Image menyertakan `TRUST_PROXY=true`, sehingga IP klien berasal dari header permintaan dan `X-Forwarded-For` yang dipalsukan melewati pembatas login. Default-nya kini daftar kepercayaan jaringan privat. (#649)
- **Penulisan pengaturan diperiksa per pengaturan**, bukan sekali di pintu masuk, dan impor konfigurasi kini transaksional sehingga kunci yang ditolak tidak dapat meninggalkan konfigurasi yang diterapkan sebagian. (#618)
- **Nama file pustaka tidak dapat keluar dari akar penyimpanannya.** Nama tersimpan yang dirancang khusus, yang disalin apa adanya oleh impor SQLite 1.x berbahaya, dapat membaca atau menghapus file di luar direktori file. Hanya dapat dijangkau setelah operator mengimpor database SQLite 1.x yang dipasok penyerang, satu-satunya jalur yang memungkinkan nama tersimpan dipilih. Dilaporkan oleh @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **Pembatalan job memberlakukan kepemilikan**, sehingga pengguna terautentikasi tidak lagi dapat membatalkan job pengguna lain berdasarkan id-nya. Dilaporkan oleh @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Audit ulang seluruh basis kode 2.0 menemukan apa yang masih terbuka**: assertion SAML yang berhasil ditangkap dapat diputar ulang, tantangan MFA tidak gugur setelah berapa pun kode salah, pencarian kunci API per permintaan adalah pemindaian tabel penuh, `MAX_WORKSPACE_SIZE_GB` adalah konfigurasi mati, dan sanitizer SVG meloloskan href `javascript:` tanpa tanda kutip. (#620)
- **Sembilan CVE yang telah diungkapkan berhasil ditambal**: fast-uri, svgo, sharp, dan tar secara transitif (#619), plus Pillow 12.3.0 (#517). Dekode RAW di arm64 kini membangun LibRaw 0.22.2 dari sumber alih-alih menautkan salinan sistem yang belum ditambal. (#649)

### Fitur baru {#v2-2-0-new-features}

- **Rounded Crop**: mask persegi dengan sudut membulat dan squircle bergaya iOS, dengan kontrol radius sudut. Dibuat untuk favicon dan ikon aplikasi. (#602)
- **Remove GIF Background**: hapus latar belakang dari GIF animasi, WebP, atau APNG frame demi frame dan dapatkan kembali animasi transparan. (#502)
- **Lasso dan mode High Quality di Object Eraser**: seret lasso bentuk bebas alih-alih melukis setiap piksel, dan opsional pasang bundel inpainting difusi untuk pengisian area besar yang lebih bersih. (#503, #566)
- **Simpan sebagai baru, atau timpa.** Mengedit file pustaka dulu diam-diam menggantikan aslinya. Kini Anda memilih per edit, dan default-nya mempertahankan file asli. (#564, #577)
- **Preset rasio aspek di Resize.** Pilih 1:1, 4:3, atau 16:9 dan kedua dimensi tetap terkunci, tanpa upscaling. (#530)
- **OCR dua tingkat**: tingkat cepat disertakan langsung di dalam image dan berjalan offline tanpa unduhan, sementara runtime yang lebih akurat dipasang sesuai permintaan. (#519)
- **Ketik di mana saja untuk mencari.** Mulai mengetik di dasbor atau beranda dan ketikan Anda langsung masuk ke kotak pencarian. (#644)
- **Dokumentasi dan situs web dalam 21 bahasa**: situs docs, halaman landing, dan referensi API semuanya kini diterjemahkan, bergabung dengan antarmuka aplikasi. Panduan deployment sumber daya rendah yang baru mencakup Raspberry Pi dan mesin 2 GB. (#548)
- **Nama tool lebih jelas**: 18 nama ambigu kini menjelaskan dirinya sendiri, sehingga "Compress" menjadi "Compress Image". ID tool dan rute tidak berubah, jadi tidak ada bookmark yang rusak. (#520)

### Peningkatan {#v2-2-0-improvements}

- **Kontras WCAG AA di seluruh antarmuka**: palet disetel ulang sehingga oranye cerah tetap pada isian sementara teks dan label memakai token warna teks yang aksesibel, dan 57 indikator fokus kini memenuhi ambang non-teks 3:1. (#567, #574)
- **Upscale dan penghapusan latar belakang tidak lagi terlihat membeku**: bilah progres maju selama inferensi alih-alih berhenti di 30%, dan kedua tool kini memperingatkan bahwa host khusus CPU jauh lebih lambat. (#605, #608)
- **Pesan timeout menyebut penyebab sebenarnya** dan memperhitungkan host khusus CPU alih-alih menyalahkan unggahan. (#596)
- **SnapOtter menunggu Postgres dan Redis saat startup** alih-alih crash-loop, baik di Compose maupun image all-in-one. Instalasi Proxmox LXC sempat restart 76 kali. (#537, #595)
- **Unduhan bertahan di balik reverse proxy**: SnapOtter meminta nginx dan proxy kompatibel untuk tidak melakukan buffering respons file, yang biasanya menjadi alasan unduhan self-hosted dimulai dan tidak pernah selesai. (#604, #607)
- **Compress PDF mendekati ukuran target**, dan mengatakannya dengan jujur ketika target tidak tercapai. (#522)
- **Kontrol tool seluler tetap terjangkau** karena shell aplikasi kini menyesuaikan ukuran dengan viewport dinamis. (#559)
- **Convert Audio menampilkan pengaturan sample rate.** (#561)
- **Admin dapat melonggarkan panjang kata sandi minimum**, hingga 1 untuk instance LAN tepercaya. (#543)
- **MFA bersifat swalayan**, masalah lockout kebijakan sudah ditutup, dan login OIDC atau SAML mendapat tantangan MFA nyata alih-alih blokir keras. (#531, #536)
- **`Error: Error` kosong kini menyebut penyebabnya.** Kegagalan encode Sharp, sidecar AI keluar, keluaran sidecar dokumen non-JSON, dan kegagalan penghapusan latar belakang semuanya dulu muncul dengan alasan yang sudah dihapus. (#532, #534, #535, #538, #612)
- **Dialog bantuan diterjemahkan.** Label pintasan dan teks panduan awalnya di-hardcode dalam bahasa Inggris sementara terjemahan yang sudah selesai tidak terpakai di 21 file locale. (#647)

### Perbaikan bug {#v2-2-0-bug-fixes}

- **File HEIC iPhone ditolak** sebagai tidak dapat dibaca sebelum mencapai dekoder yang menanganinya. (#631)
- **Preset konversi gagal pada file kedua**: jpg-to-pdf dan saudara image-to-pdf-nya, plus pdf-to-png, pdf-to-jpg, dan pdf-to-tiff, semuanya mengembalikan `Tool not found` setelah Anda mengunggah dua file. (#633, #643)
- **Preset konversi PDF kehilangan tombol unduhannya.** (#629)
- **Timeout pemrosesan tak terbatas tidak dihormati**, dan aliran progres yang macet kini pulih alih-alih membuat antarmuka menunggu. (#638)
- **Unduhan menggantung alih-alih gagal** ketika file tersimpan ternyata lebih pendek dari panjang yang tercatat. (#617)
- **Tool halaman PDF gagal pada file pendek dan terenkripsi**: Remove Pages default ke rentang halaman yang tidak dimiliki dokumen di bawah enam halaman, dan PDF yang dilindungi kata sandi gagal dengan pesan error yang tidak jelas di dalam worker. (#594)
- **PDF to Text diam-diam mengembalikan file kosong** untuk PDF hasil pindai. Kini mengarahkan Anda ke OCR dan menyajikan teks sebagai UTF-8. (#603)
- **PDF to Word menghilangkan blok teks berwarna** dan memecahnya di seluruh halaman. (#500)
- **Object Eraser meninggalkan sisa-sisa samar** dan memburamkan objek kecil pada gambar resolusi tinggi. (#501)
- **Stabilize Video menulis keluaran yang tidak dapat diputar** tanpa faststart. (#593)
- **Perbaikan editor gambar**: rotate, flip, resize, levels, curves, filter, dan kunci layer. (#597)
- **Sign PDF menampilkan kanvas kosong** alih-alih melaporkan mengapa PDF gagal dimuat. (#545)
- **Pustaka file mencatat dimensi 0x0** dan melewati pratinjau untuk unggahan HEIC, RAW, dan PSD. (#636, #637)
- **Memasang lebih dari satu bundel AI** membuat virtualenv bersama berisi banyak versi dan diam-diam merusak tiga tool. (#649)
- **Konversi ke JXL pada kualitas 1 hingga 4 mengembalikan 500**, dan ffmpeg yang hilang dilaporkan kepada Anda sebagai unggahan rusak. (#649)
- **Gangguan Postgres sementara membuat job yang sudah selesai menjadi terdampar**, meninggalkan keluaran di disk tanpa baris yang menunjuknya. Reconciler kini mengadopsi pekerjaan itu alih-alih membuangnya. (#649)
- **Endpoint Redis yang berubah alamat membuat setiap consumer macet** sementara pemeriksaan kesehatan tetap menjawab 200. (#649)
- **Perbaikan situs web dan docs**: tautan terlokalisasi tidak lagi menghilangkan fragmen `#` atau mengubah `zh-CN` menjadi huruf kecil, navigasi docs tetap di dalam viewport pada tablet, dan tidak ada situs yang memanggil API GitHub dari browser Anda lagi. (#516, #562, #570, #560)

### Catatan upgrade {#v2-2-0-upgrade-notes}

Tidak ada yang perlu dimigrasikan, tetapi dua default yang dikirim berubah:

- **`TRUST_PROXY` kini default ke `loopback,linklocal,uniquelocal`** alih-alih memercayai setiap peer. Jaringan bridge Docker dan Compose berada dalam rentang itu, jadi sebagian besar penyiapan tidak perlu diubah. Jika reverse proxy Anda menjangkau SnapOtter dari alamat publik, setel `TRUST_PROXY` secara eksplisit, atau pembatasan laju dan log audit akan mengatribusikan setiap permintaan ke proxy.
- **`MAX_AI_JOBS_PER_USER` default ke 5** job AI file tunggal yang sedang berjalan per pengguna. Proses AI batch dan pipeline tetap tanpa batas.

Pengaturan opsional baru: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (mati secara default), dan `GIF_BG_MAX_FRAMES`.

### Ucapan terima kasih {#v2-2-0-acknowledgements}

Sebagian besar rilis ini dimulai sebagai laporan bug orang lain.

Kode dan kontribusi:

- **@mvanhorn** ❤️: Menulis ulang kegagalan timeout remove-background menjadi pesan yang menyatakan apa yang harus dilakukan, bukan timeout kosong. (#518, #494)
- **@EuanTop** ❤️: Memulihkan aksi unduhan di halaman preset konversi PDF dengan membuat rute sinkron mengembalikan kontrak hasil tool standar. (#629, #623)
- **@harshjainnn** ❤️: Mendiagnosis unduhan yang dimulai dan tidak pernah selesai, dan mengusulkan arah reset soket yang menjadi dasar perbaikannya. (#617, #590)

Pengungkapan keamanan:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Mengungkapkan secara privat eskalasi hak istimewa melalui role `users:manage` yang didelegasikan, dengan analisis source-to-sink lengkap dan rantai eksploitasi yang dapat dijalankan. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Mengungkapkan IDOR terautentikasi pada pembatalan job, dan path traversal pada nama file tersimpan pustaka yang dapat dijangkau setelah impor SQLite 1.x berbahaya, dengan proof of concept yang berfungsi untuk masing-masing. (#599, #600)

Laporan bug:

- **@riz467** ❤️: File HEIC iPhone asli ditolak saat validasi, dengan akar masalah yang sudah diuraikan dalam laporan. (#622)
- **@coupej** ❤️: Halaman preset PDF menggantung selamanya, dan jpg-to-pdf gagal begitu file kedua ditambahkan. Dua bug berbeda, dipisahkan dengan benar. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` didokumentasikan sebagai tak terbatas tetapi dibatasi lima menit. (#630)
- **@bezibaerchen** ❤️: Convert Audio menyembunyikan pengaturan sample rate yang dijanjikan deskripsinya sendiri. (#558)
- **@hell-toupee** ❤️: Bundel OCR akurat gagal dipasang dengan error `libpaddle`. (#505)
- **@Michael1260** ❤️ dan **@And-CSH** ❤️: Mengonfirmasi kegagalan pemasangan OCR itu secara independen dan menetapkan bahwa ekstraksi manual berfungsi sementara penginstal dalam aplikasi tidak, yang memastikan bug-nya ada di penginstal. (#505)
- **@TomErnst1972** ❤️: Mengaktifkan kebijakan wajib MFA mengunci admin dari instance-nya sendiri. (#515)
- **@thokich** ❤️: Penghapusan objek menghasilkan isian buram yang tidak dapat digunakan, yang mendorong penulisan ulang inpainting HD dan bundel kualitas tinggi opsional. (#141)
- **@Hennie-git** ❤️: Instalasi Proxmox LXC restart 76 kali terhadap Postgres yang belum menerima koneksi. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Memilah laporan itu secara real time dan menghasilkan diagnosis yang menjadi dasar perbaikan startup. (#537)

Permintaan fitur dan umpan balik:

- **@LECOQQ** ❤️: Meminta pelonggaran kompleksitas kata sandi pada instalasi home server. (#136)
- **@killervette42** ❤️: Meminta Unraid Community App, kini diterbitkan ke toko Unraid CA. (#96)
- **@alienatedsec** ❤️: Menunjukkan bahwa perbaikan fallback GPU ke CPU terkubur di issue tertutup dan tidak dapat ditemukan, yang menjadi alasan kini ada di dokumentasi deployment. (#490, #587)
- **@neilp316** ❤️: Mengonfirmasi kegagalan GPU Blackwell pada RTX 5060 dan memetakan jalur upgrade CUDA 12.8 yang berfungsi. (#120)
- **@Roiki11** ❤️: Berargumen untuk penyimpanan bersama dengan referensi jalur alih-alih transfer file HTTP untuk komputasi AI off-box. (#189)

Terima kasih juga kepada anggota komunitas yang melaporkan hal-hal ini melalui Discord dan email, yang namanya tidak kami catat: permintaan crop squircle (#602), unduhan image-to-PDF yang dimulai dan tidak pernah selesai (#604, #607), tool Delete Pages yang macet (#594), teks Arab yang hilang dari pdf-to-text (#603), dan diagnosis di balik fallback GPU ONNX (#490).

[Diff lengkap di GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

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
