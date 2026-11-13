---
description: "Data penggunaan anonim apa yang dikumpulkan SnapOtter, kapan dikirim, dan cara mematikan analitik produk untuk seluruh instance."
i18n_source_hash: 1a68d9371570
i18n_provenance: machine
i18n_output_hash: fb05a16291d8
i18n_hash_version: 2
---

# Apa yang dikumpulkan SnapOtter {#what-snapotter-collects}

Analitik Produk Anonim aktif secara default dan diatur untuk seluruh instance oleh administrator. Matikan di Settings > System > Privacy.

## Peristiwa yang kami kirim (ketika diaktifkan) {#events-we-send-when-enabled}

- tool_used: id alat, status, durasi, kategori, apakah ini alat AI, kode error saat gagal.
- pipeline_executed: jumlah langkah, id alat, flag batch, jumlah file, durasi, status.
- ai_bundle_action: id bundle, aksi, durasi.
- Penggunaan frontend: halaman alat mana yang dibuka, file ditambahkan (hanya jumlah), alat dimulai, unduhan, penyimpanan, pencarian (hanya jumlah hasil), batch diproses.
- Laporan crash: tipe error, pesan error yang sudah disamarkan (nama file, path, email, dan nilai dalam tanda kutip dihapus), source stack dengan basename file, dan untuk alat AI, traceback Python dengan hanya basename file.

## Apa yang tidak pernah kami kumpulkan {#what-we-never-collect}

- Nama atau path file
- Isi file
- Teks keluaran OCR
- Metadata gambar (EXIF)
- Teks dokumen yang diekstrak
- Identitas akun Anda

Seperti server mana pun, PostHog melihat alamat IP asal setiap permintaan. Proyek PostHog kami membuangnya alih-alih menyimpannya, dan event dari server SnapOtter sendiri mengirim nilai pengganti sebagai gantinya.

## Pemberitahuan pembaruan {#update-notices}

Selama analitik aktif, server bertanya ke PostHog setiap beberapa jam rilis SnapOtter mana yang terbaru, dengan memakai ID anonim instance dan versinya. Jika ada rilis yang lebih baru, admin melihat pemberitahuan berisi tautan ke catatan rilis. Jika ditutup, pemberitahuan itu tetap tersembunyi sampai rilis berikutnya. Tidak ada yang dipasang atau diunduh untuk Anda, dan saat analitik nonaktif server tidak pernah bertanya.

## Cara mematikannya {#turning-it-off}

Admin: Settings > System > Privacy, matikan "Anonymous Product Analytics". Pengiriman langsung berhenti, untuk seluruh instance. Untuk membangun image yang tidak akan pernah mengirim, atur build arg `SNAPOTTER_ANALYTICS=off`.

Untuk memulai instance baru dengan analitik yang sudah nonaktif, tambahkan `SNAPOTTER_ANALYTICS_DEFAULT=off` ke environment server sebelum boot pertamanya. Dengan Docker Compose, letakkan di bawah `environment:` milik service aplikasi, karena mengaturnya hanya di `.env` tidak akan sampai ke container.
