---
description: "Cara berkontribusi ke SnapOtter. Laporan bug, permintaan fitur, pull request, dan persyaratan CLA."
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: bf536bb687ec
---

# Berkontribusi {#contributing}

Terima kasih atas minat Anda untuk berkontribusi. Panduan ini menjelaskan cara berpartisipasi, apa yang kami terima, dan cara memulai.

## Cara berkontribusi {#ways-to-contribute}

### Issue (tanpa penyiapan) {#issues-no-setup-required}

- **Laporan bug** - Ada yang rusak? Buka [laporan bug](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) dengan langkah-langkah reproduksi.
- **Permintaan fitur** - Punya ide? Mulai sebuah [diskusi](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) agar komunitas dapat menimbang dan mendukungnya.
- **Masalah terjemahan** - Menemukan terjemahan yang salah atau hilang? Buka [issue terjemahan](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml).
- **Masalah dokumentasi** - Ada yang keliru di dokumentasi? Buka [issue dokumentasi](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml).

### Kode (memerlukan CLA) {#code-requires-cla}

Kami menerima pull request untuk:

| Tipe | Proses |
|------|---------|
| Perbaikan bug | Buka PR langsung (tautkan issue jika ada) |
| Terjemahan baru | Buka PR langsung (lihat [Panduan Terjemahan](/id/guide/translations)) |
| Peningkatan dokumentasi | Buka PR langsung |
| Peningkatan cakupan tes | Buka PR langsung |
| Tool atau fitur baru | Mulai sebuah [diskusi](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) terlebih dahulu; seorang maintainer mengubah ide yang disetujui menjadi issue yang dilacak sebelum Anda menulis kode |
| Refaktor atau perubahan arsitektur | Mulai sebuah [diskusi](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) terlebih dahulu dan tunggu persetujuan maintainer sebelum menulis kode |

### Apa yang tidak akan kami terima {#what-we-will-not-accept}

- Perubahan pada alur kerja CI/CD, konfigurasi rilis, atau konfigurasi linter/compiler
- PR tanpa [Contributor License Agreement](#contributor-license-agreement) yang ditandatangani
- PR dengan lebih dari 400 baris perubahan (pecah pekerjaan besar menjadi PR yang lebih kecil)
- Fitur yang tidak didiskusikan dan disetujui terlebih dahulu
- Perubahan pada `packages/ai/` tanpa diskusi sebelumnya

## Contributor License Agreement {#contributor-license-agreement}

Sebelum kami dapat menggabungkan PR pertama Anda, Anda harus menandatangani [Individual CLA](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md) kami. Ini adalah persyaratan satu kali.

**Mengapa:** SnapOtter berlisensi ganda (AGPLv3 + komersial). CLA memberi kami hak untuk mendistribusikan kontribusi Anda di bawah kedua lisensi tersebut. Anda tetap memegang penuh hak cipta atas karya Anda.

**Bagaimana:** Ketika Anda membuka PR pertama, bot CLA Assistant akan berkomentar dengan sebuah tautan. Klik tautan itu, tinjau perjanjiannya, dan tanda tangani dengan akun GitHub Anda. Hanya butuh 30 detik.

Jika Anda berkontribusi atas nama pemberi kerja Anda dan pemberi kerja Anda memegang hak kekayaan intelektual atas karya Anda, hubungi contact@snapotter.com untuk mengatur Corporate CLA sebelum mengirimkan.

## Memulai {#getting-started}

### Prasyarat {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (hanya untuk tool AI)
- Docker (opsional, untuk pengujian integrasi penuh)

### Penyiapan {#setup}

```bash
# Fork and clone
git clone https://github.com/<your-username>/snapotter.git
cd snapotter

# Start Postgres + Redis for local dev
docker compose -f docker-compose.dev.yml up -d

# Install dependencies
pnpm install

# Start dev servers (web on :1349, API on :13490)
pnpm dev
```

### Menjalankan pemeriksaan {#running-checks}

Sebelum mengirimkan PR, pastikan semua pemeriksaan lolos secara lokal:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## Proses pull request {#pull-request-process}

1. Fork repo dan buat branch dari `main` (`feat/my-feature` atau `fix/issue-123`)
2. Lakukan perubahan Anda dalam commit yang terfokus dan dapat ditinjau menggunakan [conventional commits](https://www.conventionalcommits.org/)
3. Tambahkan atau perbarui tes untuk perubahan Anda
4. Jalankan `pnpm lint && pnpm typecheck && pnpm test` secara lokal
5. Buka PR terhadap `main` dan isi templatnya
6. Tanda tangani CLA jika diminta
7. Tunggu CI lolos dan seorang maintainer meninjau

### Ekspektasi peninjauan {#review-expectations}

- Kami berupaya menanggapi PR dalam 7 hari
- PR yang kecil dan terfokus ditinjau lebih cepat
- Jika Anda belum mendapat kabar dalam 7 hari, tinggalkan komentar untuk mengingatkan thread
- Kami mungkin meminta perubahan, menyarankan pendekatan yang berbeda, atau menutup PR jika tidak selaras dengan arah proyek

### Setelah PR Anda digabungkan {#after-your-pr-is-merged}

Kontribusi Anda akan disertakan dalam rilis berikutnya dan dicantumkan dalam changelog.

## Good first issue {#good-first-issues}

Mencari sesuatu untuk dikerjakan? Lihat [good first issues](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) kami untuk tugas yang ramah pemula, atau [help wanted](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) untuk item yang lebih besar tempat kami menghargai bantuan komunitas.

## Gaya kode {#code-style}

- Biome menangani pemformatan dan linting (tanda kutip ganda, titik koma, indentasi 2 spasi)
- Hook pra-commit menjalankan `biome check --write` pada file yang di-stage secara otomatis
- Jika linter mengeluh, perbaiki kodenya (jangan ubah konfigurasi Biome)
- ES module di mana-mana (`import`/`export`)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

Untuk detail arsitektur lengkap, lihat [Panduan Developer](/id/guide/developer).

## Keamanan {#security}

**Jangan buka PR atau issue publik untuk kerentanan keamanan.** Laporkan secara privat melalui [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) atau email contact@snapotter.com. Lihat [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md) untuk detail lengkap.

## Ada pertanyaan? {#questions}

- [Dokumentasi](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
