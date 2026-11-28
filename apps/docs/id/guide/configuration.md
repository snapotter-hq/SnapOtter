---
description: "Semua environment variable SnapOtter beserta nilai defaultnya. Atur auth, storage, model AI, analytics, dan lainnya."
i18n_source_hash: 0a7a78fd254c
i18n_provenance: machine
i18n_output_hash: 380d7bf5c599
i18n_hash_version: 2
---

# Configuration {#configuration}

Semua konfigurasi dilakukan melalui environment variable. Setiap variabel punya default yang masuk akal, sehingga SnapOtter langsung berfungsi tanpa mengatur satu pun.

## Environment variables {#environment-variables}

### Server {#server}

| Variable | Default | Description |
|---|---|---|
| `PORT` | `1349` | Port tempat server mendengarkan. |
| `HOST` | `0.0.0.0` | Alamat IP tempat server mendengarkan. Pada jaringan bridge (default untuk `docker run` dan Compose) pertahankan `0.0.0.0` (atau `::`), jika tidak, port yang dipublikasikan berhenti berfungsi. Pada instalasi native atau container di jaringan host, `127.0.0.1` menjauhkan API dari jaringan; pasang reverse proxy di depannya untuk akses jarak jauh. [Embedded mode](#embedded-mode) hanya berfungsi dengan `0.0.0.0`, `::` atau `127.0.0.1`, karena pemeriksaan startup-nya memanggil `127.0.0.1`. Dengan alamat lain apa pun, termasuk `::1`, container tidak pernah dianggap sudah berjalan, dan crash berikutnya menghentikannya alih-alih me-restart server. Apa pun yang bukan alamat IP, termasuk `localhost`, menghentikan server saat startup. |
| `BASE_PATH` | (kosong) | Path deployment publik, mis. `/snapotter`. Kosong atau `/` melayani di root domain. Diterapkan saat runtime; tidak perlu membangun ulang image. |
| `RATE_LIMIT_PER_MIN` | `1000` | Jumlah maksimum permintaan per menit per IP. Atur ke 0 untuk menonaktifkan rate limiting. |
| `API_KEYS_RATE_LIMIT_PER_MIN` | `30` | Jumlah maksimum permintaan per menit per IP ke endpoint pengelolaan API key (daftar, buat, cabut). Key yang dipakai untuk panggilan tool tidak terpengaruh. Atur ke `0` untuk tanpa batas. |
| `CORS_ORIGIN` | (kosong) | Origin yang diizinkan untuk CORS, dipisahkan koma, atau kosong untuk same-origin saja. |
| `LOG_LEVEL` | `info` | Tingkat detail log. Salah satu dari: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Peer mana yang boleh mengatur IP klien lewat `X-Forwarded-For`. Defaultnya hanya memercayai peer jaringan privat, sehingga reverse proxy di jaringan Docker atau LAN dipercaya dan header palsu dari klien publik tidak. Atur `true` hanya jika proxy yang Anda kendalikan berada di depan pada alamat publik. |
| `SNAPOTTER_ANALYTICS_DEFAULT` | `on` | Setel `off` untuk memulai instance baru dengan "Anonymous Product Analytics" dinonaktifkan, sehingga tidak mengirim apa pun sejak boot pertamanya. Variabel ini hanya mengisi setting tersebut selama belum ada yang memilih nilainya. Setelah setting disimpan, oleh admin atau oleh variabel ini, mengubah variabel tidak berpengaruh apa pun; admin tetap dapat mengaktifkan analytics di Settings > System > Privacy. |

### Authentication {#authentication}

Kedua boolean di bawah hanya menerima `true` dan `false`. Nilai lain apa pun, `1` atau `yes` atau `on`, gagal validasi dan server keluar sebelum mulai mendengarkan.

| Variable | Default | Description |
|---|---|---|
| `AUTH_ENABLED` | `true` | Wajibkan login. Atur ke `false` untuk berjalan tanpa akun sama sekali, yang memberi setiap permintaan hak admin, jadi batasi hanya untuk jaringan tepercaya. |
| `DEFAULT_USERNAME` | `admin` | Username untuk akun admin awal. Hanya dipakai pada proses pertama. |
| `DEFAULT_PASSWORD` | `admin` | Password untuk akun admin awal. Ganti setelah login pertama. |
| `MAX_USERS` | `0` (tanpa batas) | Jumlah maksimum akun pengguna terdaftar. Atur ke 0 untuk tanpa batas. |
| `SESSION_DURATION_HOURS` | `168` | Masa berlaku sesi login dalam jam (defaultnya 7 hari). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Atur ke `true` untuk melewati permintaan ganti password paksa saat login pertama. |
| `LOGIN_ATTEMPT_LIMIT` | `30` | Jumlah maksimum permintaan login per menit per IP. Percobaan berikutnya mendapat `429` sampai menit itu berakhir. Kegagalan berulang pada satu username biasanya mencapai `LOGIN_THROTTLE_MAX_FAILURES` lebih dulu. Admin dapat menimpanya di Settings > System. Atur ke `0` untuk tanpa batas. Build dari source dimulai di 10. |
| `LOGIN_THROTTLE_MAX_FAILURES` | `10` | Jumlah login password yang gagal untuk satu username dalam `LOGIN_THROTTLE_WINDOW_S` sebelum percobaan berikutnya untuknya mendapat `429`, dari IP mana pun asalnya. Percobaan diizinkan lagi saat kegagalan tertua keluar dari jendela waktu. Atur ke 0 untuk menonaktifkan throttle. |
| `LOGIN_THROTTLE_WINDOW_S` | `900` | Panjang jendela waktu tersebut, dalam detik. Minimal 1; server menolak untuk mulai jika nilainya 0. |

### Storage {#storage}

| Variable | Default | Description |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` atau `s3`. S3 dan MinIO memerlukan lisensi dengan fitur s3_storage plus variabel `S3_*` di bawah. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | Connection string PostgreSQL, dan koneksi yang melayani setiap permintaan. Pada 2.3.0 dan yang lebih baru, atur `DATABASE_MIGRATION_URL` juga dan ini menjadi role runtime dengan hak istimewa minimum, yang memegang DML pada tabel aplikasi dan tidak ada yang lain. Stack Compose mengarahkannya ke service `postgres`-nya; biarkan tidak diatur (bersama `REDIS_URL`) untuk mendapatkan mode embedded. Untuk terhubung lewat unix socket, sebutkan direktori socket di `host`, seperti pada `postgres://user:pass@localhost/snapotter?host=/var/run/postgresql`, lalu mount direktori itu ke dalam container. |
| `DATABASE_MIGRATION_URL` | (kosong) | Koneksi istimewa, hanya dipakai saat boot untuk menjalankan migrasi dan memberi grant ke role runtime, lalu ditutup sebelum permintaan pertama. Biarkan kosong dan SnapOtter berjalan dengan satu role, dengan `DATABASE_URL` mengerjakan kedua tugas. Lihat [Least-privilege roles](/id/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Connection string Redis (dipakai untuk antrean job BullMQ). Compose mengarahkannya ke service `redis`-nya. Untuk unix socket, gunakan `unix:///run/redis/redis.sock?db=5` (tambahkan `&password=...` jika Redis memerlukannya) dan mount socket ke dalam container. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Direktori untuk file sementara selama pemrosesan. Dibersihkan otomatis. Image mengatur `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Direktori untuk file pengguna yang persisten (gambar yang diunggah, hasil yang disimpan). Image mengatur `/data/files`. |
| `MAX_STORAGE_PER_USER_MB` | `5000` | Batas dalam megabyte untuk file yang disimpan setiap pengguna di library Files. Penyimpanan yang melampauinya ditolak dengan menyebutkan jumlah terpakai dan batasnya. Kuota yang diatur pada pengguna menimpanya. Atur ke 0 untuk tanpa batas. |

### S3 object storage {#s3-object-storage}

Hanya dibaca saat `STORAGE_MODE=s3`. Jika salah satu dari tiga yang wajib tidak ada, startup gagal dengan menyebut nama variabel yang Anda lewatkan.

| Variable | Default | Description |
|---|---|---|
| `S3_BUCKET` | (kosong) | Bucket yang menyimpan unggahan dan output. Wajib. |
| `S3_ACCESS_KEY_ID` | (kosong) | Access key. Wajib. Di dalam container Anda dapat me-mount-nya sebagai gantinya, lewat `S3_ACCESS_KEY_ID_FILE`. |
| `S3_SECRET_ACCESS_KEY` | (kosong) | Secret key. Wajib. Konvensi file yang sama: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Region bucket. |
| `S3_ENDPOINT` | (kosong) | Endpoint kustom untuk MinIO, R2, Backblaze, dan store lain yang kompatibel dengan S3. Kosong berarti AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Atur ke `true` untuk MinIO dan apa pun yang menginginkan `endpoint/bucket/key` alih-alih pengalamatan virtual-host. |
| `S3_PREFIX` | (kosong) | Prefix key, sehingga satu bucket dapat menampung beberapa instance. |

### Encryption at rest {#encryption-at-rest}

| Variable | Default | Description |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (kosong) | 64 karakter hex (32 byte). Mengenkripsi setting sensitif yang disimpan di database. Apa pun yang bukan 64 karakter hex ditolak saat startup. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (kosong) | Key yang akan Anda tinggalkan, dengan format yang sama. Atur keduanya selama rotasi agar baris yang ada tetap dapat didekripsi, lalu hapus yang ini. |

### Embedded mode {#embedded-mode}

Jalankan image tanpa `DATABASE_URL` dan tanpa `REDIS_URL` dan ia memulai PostgreSQL 17 dan Redis sendiri di dalam container, terikat ke loopback, dengan semua data di volume `/data`. Ini mengembalikan pengalaman `docker run` satu perintah untuk quick start, homelab, dan upgrade dari 1.x. Ini adalah jalur kemudahan, bukan deployment produksi: untuk produksi, jalankan stack Compose 3 container dengan PostgreSQL dan Redis terpisah. Embedded mode mengharuskan container berjalan sebagai root dan tidak kompatibel dengan runtime UID sembarang (OpenShift, Kubernetes `runAsNonRoot`); gunakan Compose di sana.

| Variable | Default | Description |
|---|---|---|
| `EMBEDDED` | `auto` | Aktif otomatis saat `DATABASE_URL` dan `REDIS_URL` sama-sama tidak diatur. Atur ke `0` untuk menonaktifkannya (aplikasi lalu gagal cepat jika tidak ada `DATABASE_URL`/`REDIS_URL` eksternal yang diatur, alih-alih diam-diam memulai database di dalam container). |
| `REDIS_MAXMEMORY` | `512mb` | Batas memori untuk Redis tertanam (hanya embedded mode). Turunkan pada host dengan memori terbatas seperti Raspberry Pi. |
| `EMBEDDED_PG_PORT` | `5432` | Port loopback untuk PostgreSQL tertanam (hanya embedded mode). Ubah hanya jika container berbagi jaringan tempat port 5432 sudah dipakai, seperti `--network host`. Nilainya harus berbeda dari `EMBEDDED_REDIS_PORT` dan di atas 1023, karena PostgreSQL berjalan sebagai user tanpa hak istimewa yang tidak dapat melakukan bind ke port istimewa di jaringan host. |
| `EMBEDDED_REDIS_PORT` | `6379` | Sama, untuk Redis tertanam, yang juga berjalan sebagai user tanpa hak istimewa. |
| `EMBEDDED_DB_PASSWORDS` | (kosong) | Atur ke `1` untuk membuat password acak bagi role PostgreSQL tertanam dan Redis pada boot berikutnya, yang disimpan di `/data/.embedded-db-secrets`. Login TCP kemudian memerlukannya. Pada volume yang pertama kali dibuat oleh 2.3.0 atau yang lebih baru, superuser PostgreSQL sama sekali tidak dapat login lewat TCP; pada volume yang lebih lama, pemilik database adalah superuser, dan password-nya itulah yang melindunginya. Gunakan ini setiap kali program lain berbagi jaringan container, seperti dengan `--network host`. Pengaturan ini tetap aktif untuk volume tersebut: password dipakai pada setiap boot meskipun Anda membatalkan pengaturan variabel ini, dan menghapus `/data/.embedded-db-secrets` hanya memberi Anda password baru, atau boot yang gagal jika variabel tidak diatur. Jika container tidak mau mulai karena salah satu file tersebut rusak, hapus file itu dengan `docker run --rm -v <volume>:/data --entrypoint rm snapotter/snapotter:<your tag> -r /data/.embedded-db-secrets/<name>` lalu jalankan container lagi; boot berikutnya membuat file yang baru. Variabel ini menerima `1`, `0` atau kosong, dan nilai lain apa pun menghentikan boot. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Detik yang ditunggu boot agar Redis tertanam menjawab `PING` sebelum menyerah. Saat timeout container berhenti dan mencatat alasannya, bukan menggantung. Detik bulat dari 1 hingga 999999; tidak ada nilai tanpa batas, karena menunggu selamanya adalah kegagalan yang dicegah oleh batas ini. Naikkan hanya jika host yang lambat memicunya. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | Sama, untuk PostgreSQL tertanam. Jam mulai berjalan setelah `initdb` first-boot selesai, sehingga mencakup server start dan crash recovery, bukan pembuatan database awal. |

Upgrade dari 1.x: letakkan `snapotter.db` lama Anda di `/data/snapotter.db` dalam volume dan embedded mode mengimpornya ke PostgreSQL tertanam saat first boot. Impor berjalan sekali; boot berikutnya melewatinya.

Catatan telemetri: embedded mode mewarisi default analytics dari image seperti konfigurasi lainnya. Image yang dipublikasikan dikirim dengan analytics aktif; untuk menonaktifkannya, bangun dengan `--build-arg SNAPOTTER_ANALYTICS=off`, atur `SNAPOTTER_ANALYTICS_DEFAULT=off` sebelum boot pertama, atau gunakan opt-out admin di dalam aplikasi.

### Processing limits {#processing-limits}

| Variable | Default | Description |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (tanpa batas) | Ukuran file maksimum per unggahan dalam megabyte. Atur ke 0 untuk tanpa batas. Image yang dipublikasikan dikirim dengan `0`; build dari source dimulai di 100. |
| `MAX_BATCH_SIZE` | `0` (tanpa batas) | Jumlah file maksimum dalam satu permintaan batch. Atur ke 0 untuk tanpa batas. Image yang dipublikasikan dikirim dengan `0`; build dari source dimulai di 100. |
| `CONCURRENT_JOBS` | `0` (otomatis) | Jumlah job batch yang berjalan paralel. Atur ke 0 untuk mendeteksi otomatis berdasarkan core CPU yang tersedia. |
| `MAX_MEGAPIXELS` | `0` (tanpa batas aplikasi) | Resolusi gambar maksimum yang diizinkan dalam megapiksel. Atur ke 0 untuk menghapus batas milik SnapOtter sendiri. Decoder gambar tetap menolak apa pun di atas sekitar 268 MP (16383 x 16383 piksel), sehingga nilai di atas 268 tidak berpengaruh tambahan. |
| `MAX_CPU_UPSCALE_MP` | `4` | Input terbesar, dalam megapiksel, yang diterima upscaling AI pada host tanpa GPU. Output hasil upscale juga dibatasi 16 kali nilai ini (64 MP secara default), sehingga faktor skala yang tinggi menurunkan batas input lebih jauh. Gambar yang lebih besar diperkecil agar muat sebelum upscaling; jika itu membuat hasilnya tidak lebih besar dari aslinya, permintaan ditolak. Lanczos melewati batas input tetapi tidak batas output. Atur ke 0 untuk tanpa batas, yang membutuhkan banyak RAM: RealESRGAN selalu membuat buffer 4x secara internal. |
| `MAX_WORKSPACE_SIZE_GB` | `0` (tanpa batas) | Batas dalam GB untuk gabungan ukuran unggahan dan hasil tersimpan di workspace. Setelah terlampaui, unggahan dan permintaan tool mendapat 503 sampai file kedaluwarsa setelah `FILE_MAX_AGE_HOURS`. Atur ke 0 untuk tanpa batas; penyimpanan lokal tetap menolak penulisan dengan 503 saat disk memiliki ruang kosong kurang dari 0,5 GB. Image yang dipublikasikan dikirim dengan `0`; build dari source dimulai di 10. |
| `MAX_WORKER_THREADS` | `0` (otomatis) | Worker thread maksimum untuk pemrosesan gambar. Atur ke 0 untuk mendeteksi otomatis berdasarkan core CPU yang tersedia. |
| `PROCESSING_TIMEOUT_S` | `0` (tanpa batas) | Timeout untuk setiap panggilan ke sidecar Python yang menjalankan tool AI, dalam detik. Atur ke 0 untuk tanpa batas. Ini tidak membatasi job gambar, PDF, atau media; itu tugas `JOB_TIMEOUT_FAST_S` dan `JOB_TIMEOUT_LONG_S`. |
| `AI_SIDECAR_IDLE_TIMEOUT` | `600` | Jumlah detik sidecar AI Python dan runtime OCR Akurat menganggur sebelum keluar dan membebaskan memorinya (sekitar 1,3 GB dan 0,7 GB setelah warm). Keduanya mulai lagi pada permintaan berikutnya, sehingga panggilan AI pertama setelah keluar karena menganggur menanggung biaya startup library, beberapa detik. Atur ke 0 agar keduanya tetap berjalan. Default-nya sama dengan `AI_SESSION_IDLE_TIMEOUT`, sehingga model yang dimuat tidak dibuang lebih awal dari yang ditentukan setting tersebut. Jika Anda menaikkan `AI_SESSION_IDLE_TIMEOUT`, naikkan juga nilai ini agar sama. |
| `AI_SESSION_IDLE_TIMEOUT` | `0` (otomatis) | Jumlah detik model AI yang sudah dimuat tetap tersimpan di cache sidecar setelah pemakaian terakhir. Otomatis berarti 600. Dibaca oleh sidecar Python, yang juga membuang semua model di cache saat keluar setelah `AI_SIDECAR_IDLE_TIMEOUT`. |
| `AI_SESSION_CACHE_BYTES` | `0` (otomatis) | Anggaran memori untuk model AI di cache, dalam byte. Otomatis adalah 40% memori GPU, dan tidak ada caching sama sekali pada host hanya CPU. Atur pada host CPU untuk menyimpan model di RAM; atur ke 1 untuk menonaktifkan caching pada host GPU. Dibaca oleh sidecar Python. |
| `MAX_AI_JOBS_PER_USER` | `5` | Jumlah job AI satu file yang boleh dimiliki satu pengguna dalam antrean atau berjalan sekaligus. Job tambahan mendapat `429` sampai salah satu selesai. Pool AI menjalankan satu job pada satu waktu, sehingga ini mencegah satu pengguna menguasainya. Eksekusi AI batch dan pipeline tidak dihitung. Atur ke 0 untuk tanpa batas. |
| `JOB_TIMEOUT_FAST_S` | `120` | Batas waktu untuk satu job di pool cepat (tool gambar dan dokumen), dalam detik. Job yang berjalan lebih lama gagal dengan error timeout. Atur ke 0 untuk tanpa batas. |
| `JOB_TIMEOUT_LONG_S` | `7200` | Batas waktu untuk satu job di pool panjang (tool AI dan media, ditambah tool apa pun yang ditandai sebagai berjalan lama), dalam detik. Atur ke 0 untuk tanpa batas. OCR PDF Balanced dan Best memperpanjang batas waktunya sendiri berdasarkan jumlah halaman (2 dan 5 menit per halaman), hingga 6 jam, sehingga PDF besar tidak memerlukan nilai ini dinaikkan. |
| `SYNC_WAIT_MS` | `8000` | Berapa lama permintaan tool menunggu job-nya sebelum API berhenti menunggu dan mengembalikan `202` dengan ID job untuk diikuti lewat SSE, dalam milidetik. Ini tidak menghentikan job. Atur ke 0 untuk menunggu job berapa pun lamanya. |
| `MAX_PIPELINE_STEPS` | `20` | Jumlah langkah maksimum dalam sebuah pipeline. Atur ke 0 untuk tanpa batas. |
| `MAX_PIPELINE_STEP_PIXELS` | `67108864` | Output terbesar yang boleh diminta satu langkah pipeline, sebagai lebar kali tinggi dalam piksel (defaultnya 8192 x 8192). Langkah yang pengaturannya meminta lebih besar ditolak sebelum pipeline berjalan. Atur ke 0 untuk tanpa batas. |
| `MAX_CANVAS_PIXELS` | `0` (tanpa batas) | Ukuran canvas maksimum dalam piksel untuk gambar output. Atur ke 0 untuk tanpa batas. |
| `MAX_SVG_SIZE_MB` | `50` | SVG terbesar yang diterima sebelum disanitasi, dalam megabyte. `0` berperilaku berbeda di sini dibanding baris-baris di sekitarnya. Nilai itu menghapus batas ukuran pra-parse sepenuhnya, bukan menaikkannya, jadi biarkan yang satu ini tetap diatur. |
| `MAX_PDF_PAGES` | `0` (tanpa batas) | Jumlah halaman PDF maksimum untuk konversi PDF-ke-gambar. Atur ke 0 untuk tanpa batas. |
| `MAX_VIDEO_DURATION_S` | `0` (tanpa batas) | Video terpanjang yang diterima tool video, dalam detik. File yang lebih panjang ditolak sebelum diproses, dengan durasi dan batasnya di dalam pesan error. Atur ke 0 untuk tanpa batas. |
| `MAX_AUDIO_DURATION_S` | `0` (tanpa batas) | Sama, untuk tool audio. |
| `MAX_VIDEO_BITRATE_KBPS` | `0` (tanpa batas) | Bitrate keseluruhan tertinggi yang diterima tool video, dalam kilobit per detik. Atur ke 0 untuk tanpa batas. |
| `PREVIEW_TIMEOUT_S` | `300` | Batas waktu untuk meng-encode satu klip pratinjau di browser dari file video atau audio, dalam detik. Pratinjau dokumen memakai `LIBREOFFICE_TIMEOUT_S`. Atur ke 0 untuk tanpa batas. |
| `LIBREOFFICE_TIMEOUT_S` | `120` | Batas waktu untuk satu konversi LibreOffice (Word, Excel, dan PowerPoint ke PDF, konverter dokumen, dan pratinjau dokumen), dalam detik. Atur ke `0` untuk tanpa batas. |
| `GIF_BG_MAX_FRAMES` | `150` | Jumlah frame terbanyak yang diterima Remove GIF Background dalam satu animasi. Animasi yang lebih panjang mendapat `400` yang menyebutkan jumlah frame. Atur ke 0 untuk tanpa batas frame; anggaran piksel terpisah tetap berlaku. |
| `SUBPROCESS_MEMORY_LIMIT_MB` | `0` (nonaktif) | Batas address space, dalam megabyte, untuk setiap proses pembantu berikut: ffmpeg, ffprobe, Ghostscript, qpdf, LibreOffice, pandoc, dan pdfcpu di engine media dan dokumen, ditambah, untuk gambar, exiftool, decoder dan encoder HEIF, JPEG XL, dan JPEG 2000, decoder RAW, dan decoder fallback ffmpeg. ImageMagick tidak dibatasi, karena sudah punya batas memorinya sendiri, begitu pula sidecar AI. Proses yang melampaui batas dihentikan, alih-alih mendorong seluruh container ke out-of-memory killer. Ini membatasi memori virtual, bukan memori resident, jadi atur jauh di atas yang sebenarnya dipakai sebuah proses. Encoder JPEG XL membutuhkan paling banyak: gambar 24 MP membutuhkan sekitar 1,8 GB dan gagal pada 1 GB, dan menambah thread atau CPU tidak banyak mengubahnya. Selama batas ini diatur, encoder HEIF dibatasi pada dua worker thread, yang menurunkan encode 24 MP menjadi sekitar 0,8 GB dengan konsekuensi encode yang lebih lambat. Mulailah dari `2048` dan turunkan hanya setelah menguji file terbesar Anda. Atur ke 0 untuk menonaktifkannya dan mengandalkan batas memori container. |
| `MAX_SETTINGS_PAYLOAD_KB` | `64` | Field `settings` terbesar yang boleh dibawa permintaan tool, dalam kilobyte, dihitung dalam byte UTF-8. Permintaan yang melebihi batas mendapat `400`. Atur ke 0 untuk tanpa batas. Setting tool yang sebenarnya jauh lebih kecil dari 64 KB, jadi naikkan ini hanya jika klien mengirim setting yang luar biasa besar. |
| `MAX_SUBTITLE_SIZE_MB` | `1` | File subtitle terbesar (`.srt`, `.vtt`, `.ass`) yang diterima Burn Subtitles dan Embed Subtitles, dalam megabyte. File yang lebih besar mendapat `400` yang menyebutkan ukuran file dan batasnya. Atur ke 0 untuk tanpa batas. File subtitle film berdurasi penuh biasanya jauh di bawah 1 MB. |
| `MAX_METADATA_TAG_LENGTH` | `10000` | Nilai terpanjang yang ditulis Edit Metadata ke satu tag (artist, description, keywords, dan seterusnya), dalam karakter. Nilai yang lebih panjang mendapat `400` yang menyebutkan tag dan batasnya. Atur ke 0 untuk tanpa batas. Naikkan jika Anda menyimpan caption atau deskripsi panjang. Nilai tag juga harus muat dalam `MAX_SETTINGS_PAYLOAD_KB` dan batas per argumen sistem operasi (128 KB di Linux). |

### Alat AI {#ai-tools}

Variabel ini dibaca oleh Python sidecar. Atur di environment container (atau di `.env` untuk file Compose yang dipublikasikan) lalu restart.

| Variable | Default | Deskripsi |
|---|---|---|
| `SNAPOTTER_GPU` | (kosong) | Atur ke `0`, `false`, atau `no` agar semua alat AI tetap berjalan di CPU meskipun ada GPU. Nilai lain, atau dibiarkan kosong, membuat SnapOtter memakai GPU yang terdeteksi. Pakai ini saat GPU kecil kehabisan memori di tengah pekerjaan, atau saat masalah driver membuat proses GPU gagal. Pengaruhnya lebih mungkin terasa di instalasi native dan LXC, yang kini memakai GPU bila pip cuDNN wheel tersedia. Proses di CPU lebih lambat, dan `MAX_CPU_UPSCALE_MP` berlaku untuk upscaling. |
| `SD15_INPAINT_DIR` | `$MODELS_PATH/sd15-inpainting` | Folder berisi model inpainting Stable Diffusion 1.5 (layout diffusers) yang dipakai Hapus Objek dalam mode kualitas tinggi. Feature bundle `inpaint-hq` menaruhnya di sini, jadi ubah hanya jika Anda menyimpan model di tempat lain. `MODELS_PATH` diatur oleh SnapOtter ke `ai/models` di dalam direktori data. |
| `SD15_INPAINT_STEPS` | `28` | Langkah denoising per penghapusan. Lebih banyak langkah bisa menambah detail dan memakan waktu secara proporsional. |
| `SD15_INPAINT_STRENGTH` | `0.95` | Seberapa jauh model boleh melukis ulang area yang di-mask, dari 0 sampai 1. Nilai rendah mempertahankan lebih banyak piksel asli (area itu diisi dulu dari sekitarnya, lalu diperhalus sedikit). Nilai tinggi membiarkan model melukis ulang lebih bebas, dan `1` mengabaikan sekitarnya dan melukis dari noise, sehingga lebih mungkin menciptakan objek baru. |
| `SD15_INPAINT_GUIDANCE` | `7.0` | Seberapa kuat model mengikuti prompt. Nilai tinggi mengikutinya lebih harfiah; nilai yang sangat tinggi bisa terlihat kasar. |
| `SD15_INPAINT_PROMPT` | (kosong) | Teks yang menjelaskan apa yang dilukis ke area yang dihapus. Dibiarkan kosong paling baik untuk penghapusan, karena model lalu melanjutkan area sekitarnya. |
| `SD15_INPAINT_NEGATIVE` | `object, person, text, watermark, artifact, blurry, distorted, extra limbs` | Teks yang menjelaskan apa yang harus dijauhkan dari area yang dihapus. Default mengarahkan model agar tidak melukis objek baru di celah itu. |
| `SD15_INPAINT_SEED` | `0` | Seed acak. Seed tetap membuat gambar dan mask yang sama terhapus dengan cara yang sama setiap kali. Ubah untuk mendapatkan hasil berbeda. |

### Engines {#engines}

SnapOtter mencari setiap binary pemrosesan di `$PATH` di dalam container, jadi variabel ini tetap kosong kecuali Anda me-mount build milik Anda sendiri.

| Variable | Default | Description |
|---|---|---|
| `FFMPEG_PATH` | (kosong) | Path ke binary `ffmpeg` di balik tool video dan audio. |
| `FFPROBE_PATH` | (kosong) | Path ke `ffprobe`, yang membaca file media sebelum diproses. Arahkan ke build yang sama dengan `FFMPEG_PATH`. |
| `QPDF_PATH` | (kosong) | Path ke `qpdf`, dipakai oleh tool PDF dan untuk memeriksa PDF yang diunggah. |
| `SOFFICE_PATH` | (kosong) | Path ke `soffice` milik LibreOffice, dipakai untuk konversi dokumen office. |
| `PDFCPU_PATH` | (kosong) | Path ke `pdfcpu`, dipakai oleh beberapa tool PDF. |
| `GS_PATH` | (kosong) | Path ke `gs` milik Ghostscript, dipakai oleh tool PDF dan OCR PDF. |
| `PANDOC_PATH` | (kosong) | Path ke `pandoc`, dipakai oleh konversi dokumen. |
| `SNAPOTTER_FONT_FILE` | (kosong) | File font untuk teks yang digambar ke video (burn subtitle, watermark video). Kosong memakai font pertama yang ditemukan image. |
| `SNAPOTTER_FONT_FAMILY` | (kosong) | Nama family dari `SNAPOTTER_FONT_FILE`. Kosong berarti `Sans`. |
| `SNAPOTTER_HW_ACCEL` | (kosong) | Keluarga encoder video hardware, `nvenc` atau `vaapi`. Kosong berarti encode dengan software. |

`SNAPOTTER_HW_ACCEL` memerlukan ffmpeg yang dibangun dengan keluarga encoder tersebut, dan ffmpeg di dalam image tidak memiliki keduanya. Dengan binary bawaan image, pengaturan ini beralih ke software encoding dan menyatakannya di log startup. Untuk memakainya, mount build ffmpeg Anda sendiri, arahkan `FFMPEG_PATH` dan `FFPROBE_PATH` ke sana, dan berikan perangkat GPU ke container. Untuk `nvenc`, atur juga `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`: image hanya meminta `compute,utility`, dan tanpa `video` runtime NVIDIA tidak me-mount pustaka encode, sehingga encoder tercantum tetapi setiap encode gagal. Override path yang tidak ada atau tidak dapat dieksekusi juga disebut di log startup, dan setiap job yang memerlukan binary itu gagal sampai Anda memperbaiki path-nya atau membatalkan pengaturannya.

File Compose yang dipublikasikan meneruskan semuanya dari `.env`, jadi mengaturnya di sana sudah cukup.

### Cleanup {#cleanup}

| Variable | Default | Description |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Berapa lama hasil pemrosesan yang belum disimpan (unggahan mentah dan output tool) disimpan sebelum dihapus otomatis. File yang Anda simpan secara eksplisit ke library Files tidak terpengaruh dan bertahan sampai Anda menghapusnya. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Seberapa sering job pembersihan berjalan. |
| `JOBS_RETENTION_DAYS` | `30` | Jumlah hari catatan job yang selesai (completed, failed, atau canceled) disimpan sebelum penyapuan retensi, yang berjalan setiap 6 jam, menghapusnya. Admin dapat menimpanya di Settings > System. Pengguna dan tim dengan legal hold tetap menyimpannya. Atur ke 0 untuk menyimpannya selamanya. |
| `AUDIT_RETENTION_DAYS` | `0` (selamanya) | Jumlah hari entri audit log disimpan. Aturan override dan legal hold sama. Tidak ada yang dihapus selama audit logging tahan manipulasi aktif. Atur ke 0 untuk menyimpannya selamanya. |

### Enterprise license {#enterprise-license}

| Variable | Default | Description |
|---|---|---|
| `SNAPOTTER_LICENSE_KEY` | (kosong) | License key yang membuka fitur enterprise, seperti SAML, SCIM, dan penyimpanan S3. Dibaca saat startup, jadi restart setelah mengubahnya. Key yang tidak valid atau kedaluwarsa mencatat peringatan dan server berjalan tanpa fitur tersebut. Di container Anda dapat me-mount-nya, lewat `SNAPOTTER_LICENSE_KEY_FILE` (lihat [Docker secrets](/id/guide/security#docker-secrets)). |

### Appearance {#appearance}

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_THEME` | `light` | Tema default untuk sesi baru. `light`, `dark`, atau `system`. |
| `DEFAULT_LOCALE` | `en` | Bahasa antarmuka default. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Tata letak tool default. `sidebar` atau `fullscreen`. |

### Docker permissions {#docker-permissions}

| Variable | Default | Description |
|---|---|---|
| `PUID` | `999` | Jalankan proses container sebagai UID ini. Atur agar sesuai dengan user host Anda untuk bind mount (`id -u`). Memerlukan root filesystem yang dapat ditulis; lihat [panduan keamanan](/id/guide/security#why-read-only-is-not-set). |
| `PGID` | `999` | Jalankan proses container sebagai GID ini. Atur agar sesuai dengan grup host Anda untuk bind mount (`id -g`). Memerlukan root filesystem yang dapat ditulis; lihat [panduan keamanan](/id/guide/security#why-read-only-is-not-set). |

## Docker example {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## Volumes {#volumes}

Stack Docker Compose memakai empat volume:

- `/data` (app) - Model AI, Python venv, dan file pengguna. Mount ini untuk mempertahankan file yang diunggah dan AI bundle yang terpasang di antara restart.
- `/tmp/workspace` (app) - Penyimpanan sementara untuk file yang sedang diproses. Ini boleh bersifat ephemeral, tetapi me-mount-nya mencegah writable layer container terisi penuh.
- `SnapOtter-pgdata` (postgres) - Direktori data PostgreSQL. Ini menyimpan semua data relasional (pengguna, setting, pipeline, job, audit log). Cadangkan lewat `pg_dump` atau snapshot volume.
- `SnapOtter-redisdata` (redis) - File append-only Redis untuk antrean job yang tahan lama.
