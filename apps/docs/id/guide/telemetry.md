---
description: "Data penggunaan anonim apa yang dikumpulkan SnapOtter, kapan dikirim, dan cara mematikan analitik produk untuk seluruh instance."
i18n_source_hash: 5d72dedaeb23
i18n_provenance: human
i18n_output_hash: b753bc59abac
---

# Apa yang dikumpulkan SnapOtter {#what-snapotter-collects}

Analitik Produk Anonim aktif secara default dan diatur untuk seluruh instance oleh administrator. Matikan di Settings > System > Privacy.

## Peristiwa yang kami kirim (ketika diaktifkan) {#events-we-send-when-enabled}

- tool_used: id alat, status, durasi, kategori, apakah ini alat AI, kode error saat gagal.
- pipeline_executed: jumlah langkah, id alat, flag batch, jumlah file, durasi, status.
- ai_bundle_action: id bundle, aksi, durasi.
- Penggunaan frontend: halaman alat mana yang dibuka, file ditambahkan (hanya jumlah), alat dimulai, unduhan, penyimpanan, pencarian (hanya jumlah hasil), batch diproses.
- Laporan crash: tipe error dan source stack dengan hanya basename file.

## Apa yang tidak pernah kami kumpulkan {#what-we-never-collect}

- Nama atau path file
- Isi file
- Teks keluaran OCR
- Metadata gambar (EXIF)
- Teks dokumen yang diekstrak
- Alamat IP atau identitas akun Anda

## Cara mematikannya {#turning-it-off}

Admin: Settings > System > Privacy, matikan "Anonymous Product Analytics". Pengiriman langsung berhenti, untuk seluruh instance. Untuk membangun image yang tidak akan pernah mengirim, atur build arg `SNAPOTTER_ANALYTICS=off`.
