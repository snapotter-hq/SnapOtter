---
description: "Struktur monorepo, arsitektur aplikasi dan paket, siklus hidup permintaan, dan jejak sumber daya SnapOtter."
i18n_output_hash: d4bd8ceef301
i18n_source_hash: a53946e760b0
i18n_provenance: human
---

# Arsitektur {#architecture}

SnapOtter adalah monorepo yang dikelola dengan workspace pnpm dan Turborepo. Ia di-deploy sebagai stack Docker Compose 3 kontainer: image aplikasi SnapOtter, PostgreSQL 17, dan Redis 8.

## Struktur proyek {#project-structure}

```
snapotter/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── docs/         # This VitePress site
├── packages/
│   ├── image-engine/ # Sharp-based image operations
│   ├── media-engine/ # FFmpeg spawn + progress parsing
│   ├── doc-engine/   # qpdf, LibreOffice, ghostscript wrappers
│   ├── ai/           # Python AI model bridge
│   └── shared/       # Types, constants, i18n
└── docker/           # Dockerfile and Compose config
```

## Paket {#packages}

### `@snapotter/image-engine` {#snapotter-image-engine}

Pustaka pemrosesan gambar inti yang dibangun di atas [Sharp](https://sharp.pixelplumbing.com/). Ia menangani semua operasi non-AI: resize, crop, rotate, flip, convert, compress, strip metadata, dan penyesuaian warna (kecerahan, kontras, saturasi, grayscale, sepia, invert, saluran warna).

Paket ini tidak memiliki dependensi jaringan dan berjalan sepenuhnya dalam proses.

### `@snapotter/ai` {#snapotter-ai}

Lapisan jembatan yang memanggil runtime asli dan Python ML. Sebagian besar alat Python menggunakan dispatcher persisten yang melakukan pra-impor pustaka berat (PIL, NumPy, MediaPipe, rembg) sehingga panggilan berikutnya melewati overhead impor. OCR diisolasi dari lingkungan bersama yang dapat diubah: `fast` memanggil Tesseract asli, sementara `balanced` dan `best` menggunakan JSONL dispatcher persisten khusus yang disematkan pada generasi RapidOCR/ONNX aktif yang tidak dapat diubah. Setiap permintaan memiliki generation lease. Aktivasi pertama-tama menjalankan smoke test pada kandidat, kemudian beralih secara atom ke dispatcher-nya. Saluran air dispatcher sebelumnya sebelum pembangkitannya dikumpulkan sampahnya.

**Model tidak dimuat terlebih dahulu.** Setiap skrip tool memuat bobot modelnya dari disk pada waktu permintaan dan membuangnya saat permintaan selesai. Lihat [Jejak sumber daya](#resource-footprint) untuk profil memori lengkap.

Operasi yang didukung: penghapusan latar belakang (rembg/BiRefNet), peningkatan (RealESRGAN), keburaman wajah (MediaPipe), penyempurnaan wajah (GFPGAN/CodeFormer), penghapusan objek (LaMa ONNX), OCR (Tesseract dan RapidOCR dengan model PP-OCR ONNX), pewarnaan (DDColor), penghilangan noise, penghilangan mata merah, restorasi foto, pembuatan foto paspor, perbaikan transparansi (BiRefNet HR-matting), dan pengubahan ukuran berdasarkan konten (Go caire biner).

Skrip Python ada di `packages/ai/python/`. Paket model opsional berukuran besar dipasang sesuai permintaan ke dalam volume `/data/ai` yang persisten. OCR yang akurat menggunakan artefak khusus platform yang ditandatangani; tingkat Tesseract bawaan tidak memerlukan pengunduhan paket model.

### `@snapotter/shared` {#snapotter-shared}

Tipe TypeScript bersama, konstanta (seperti `APP_VERSION` dan definisi tool), dan string terjemahan i18n yang digunakan oleh frontend dan backend.

## Aplikasi {#applications}

### API (`apps/api`) {#api-apps-api}

Server Fastify v5 yang mengekspos 241 route tool di lima modalitas (image, video, audio, PDF, file) yang menangani:
- Unggahan file, manajemen workspace sementara, dan penyimpanan file persisten
- Pustaka file pengguna (tabel `user_files`): secara default, sebuah editan yang disimpan disimpan sebagai file baru yang independen, atau sebagai versi yang tertaut ke induk ketika Anda menimpa file asli. Ia mencatat tool mana yang diterapkan (`toolChain`) dan mendapatkan thumbnail yang dibuat otomatis untuk halaman Files
- Eksekusi tool (mengarahkan setiap permintaan tool ke image engine atau AI bridge)
- Orkestrasi pipeline (merangkai beberapa tool secara berurutan)
- Pemrosesan batch dengan kontrol konkurensi melalui antrean job BullMQ (pool: image, media, ai, docs, system)
- Autentikasi pengguna, RBAC (peran admin/user dengan set izin lengkap), manajemen kunci API, dan pembatasan laju
- Manajemen Teams - CRUD hanya-admin; pengguna ditugaskan ke sebuah tim melalui field `team` di profil mereka
- Pengaturan runtime - penyimpanan key-value di tabel `settings` yang mengontrol `disabledTools`, `enableExperimentalTools`, `loginAttemptLimit`, dan tombol operasional lainnya tanpa deploy ulang
- Branding kustom dan preferensi runtime melalui pengaturan yang didukung basis data
- Dokumentasi Scalar/OpenAPI di `/api/docs`
- Menyajikan frontend yang telah dibangun sebagai SPA dalam produksi

Dependensi utama: Fastify, Drizzle ORM (pg-core, node-postgres), Sharp, BullMQ, ioredis, Zod untuk validasi.

Server menangani penghentian yang mulus pada SIGTERM/SIGINT: ia menguras koneksi HTTP, menghentikan worker BullMQ, mematikan dispatcher Python, dan menutup koneksi basis data.

### Web (`apps/web`) {#web-apps-web}

Aplikasi single-page React 19 yang dibangun dengan Vite. Menggunakan Zustand untuk manajemen state, Tailwind CSS v4 untuk penataan, dan Lucide untuk ikon. Berkomunikasi dengan API melalui REST dan SSE (untuk pelacakan progres).

Halaman mencakup workspace tool, halaman Files untuk mengelola unggahan dan hasil persisten, pembuat automasi/pipeline, dan panel pengaturan admin.

Frontend yang telah dibangun disajikan oleh backend Fastify dalam produksi, jadi tidak ada server web terpisah di kontainer Docker.

### Docs (`apps/docs`) {#docs-apps-docs}

Situs VitePress ini. Di-deploy ke Cloudflare Pages secara otomatis saat push ke `main`.

## Bagaimana sebuah permintaan mengalir {#how-a-request-flows}

1. Pengguna memilih sebuah tool di UI web dan mengunggah file.
2. Frontend mengirim POST multipart ke `/api/v1/tools/:section/:toolId` dengan file dan pengaturan.
3. Route API memvalidasi input dengan Zod, lalu mengirim pemrosesan.
4. Untuk tool standar, job dimasukkan ke antrean ke pool BullMQ yang sesuai (image, media, atau docs berdasarkan modalitas). Worker BullMQ dalam proses secara otomatis mengorientasikan gambar berdasarkan metadata EXIF, menjalankan fungsi proses tool, dan mengembalikan hasilnya.
5. Untuk sebagian besar alat AI, jembatan TypeScript mengirimkan permintaan ke Python dispatcher yang persisten. OCR yang cepat malah memanggil Tesseract, dan OCR yang akurat memulai eksekusi yang disematkan dari generasi OCR aktif yang tidak dapat diubah. Tingkat OCR yang diminta ditetapkan saat masuk dan tidak pernah diubah secara diam-diam selama eksekusi.
6. Progres job dipertahankan ke tabel `jobs` di PostgreSQL sehingga state bertahan saat kontainer dimulai ulang. Pembaruan waktu nyata dikirimkan melalui SSE di `/api/v1/jobs/:jobId/progress`.
7. API mengembalikan `jobId` dan `downloadUrl`. Pengguna mengunduh file yang telah diproses dari `/api/v1/download/:jobId/:filename`.

Untuk pipeline, API memberi output setiap langkah sebagai input ke langkah berikutnya, menjalankannya secara berurutan.

Untuk pemrosesan batch, API menggunakan flow BullMQ dengan child job per langkah dan mengembalikan file ZIP berisi semua file yang diproses.

## Jejak sumber daya {#resource-footprint}

SnapOtter dirancang untuk penggunaan memori idle yang rendah. Tidak ada yang dimuat terlebih dahulu atau dijaga tetap hangat saat startup.

### Saat idle {#at-idle}

Proses Node.js/Fastify, PostgreSQL, dan Redis berjalan. RAM idle tipikal adalah **~200-300 MB** di ketiga kontainer (proses Node.js, Postgres, dan Redis). Tidak ada proses Python, tidak ada bobot model di memori.

### Apa yang mulai, dan kapan {#what-starts-and-when}

| Komponen | Mulai saat | Memori saat aktif |
|-----------|-------------|---------------------|
| Server Fastify + Postgres + Redis | Kontainer mulai | ~200-300 MB total |
| Worker BullMQ | Kontainer mulai (dalam proses) | Satu worker per pool (image, media, ai, docs, system) |
| Dispatcher Python | Permintaan tool AI pertama | Interpreter Python + pustaka yang diimpor terlebih dahulu (PIL, NumPy, MediaPipe, rembg) - tanpa bobot model |
| Bobot model AI | Selama permintaan tool spesifik | Dimuat dari disk, dibebaskan saat permintaan selesai |

### Pemuatan model {#model-loading}

Semua file bobot model (berjumlah beberapa GB) berada di disk di `/opt/models/` setiap saat. Setiap skrip tool AI hanya memuat model miliknya sendiri ke memori selama durasi permintaan, lalu melepaskannya. Beberapa skrip secara eksplisit memanggil `del model` dan `torch.cuda.empty_cache()` setelah inferensi untuk memastikan memori segera dikembalikan.

Tidak ada cache model antar permintaan. Menjalankan tool AI yang sama berturut-turut memuat ulang model setiap kali. Ini menjaga memori idle mendekati nol dengan biaya penundaan pemuatan model pada setiap permintaan AI.

### Cold start permintaan AI pertama {#first-ai-request-cold-start}

Dispatcher Python tidak berjalan saat kontainer dimulai. Permintaan AI pertama memicu dua hal secara paralel: dispatcher mulai memanas di latar belakang, dan permintaan itu sendiri mundur ke pemunculan subproses Python sekali pakai. Setelah dispatcher menandakan siap, semua permintaan AI berikutnya menggunakannya secara langsung dan melewati biaya pemunculan subproses.
