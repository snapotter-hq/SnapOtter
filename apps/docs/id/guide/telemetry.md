---
description: "Data penggunaan anonim apa saja yang dikumpulkan SnapOtter, kapan data dikirim, cara kerja pilihan saat pertama kali dijalankan, dan cara mematikan analitik produk untuk seluruh instans."
i18n_source_hash: 784b2a0c06eb
i18n_provenance: machine
i18n_output_hash: a0f2db0dc3c7
i18n_hash_version: 2
---

# Apa yang dikumpulkan SnapOtter {#what-snapotter-collects}

Anonymous Product Analytics diatur untuk seluruh instans oleh administrator. Instans baru menanyakannya saat pertama kali dijalankan dan tidak mengirim apa pun sampai ada yang menjawab. Anda dapat mengubahnya kapan saja di Settings > System > Privacy.

Saat analitik aktif, SnapOtter mengirim ke PostHog alat dan pipeline apa yang dijalankan, berapa lama prosesnya, apakah berhasil, kode kesalahan, dan jumlah file, beserta ID anonim instans, versinya, arsitektur CPU, sistem operasi, jenis instalasi, dan ada tidaknya GPU. Laporan crash dikirim ke Sentry dengan nama file, path, email, dan nilai dalam tanda kutip dihapus. SnapOtter tidak pernah mengirim file Anda, nama atau path-nya, isinya, keluaran OCR atau teks hasil ekstraksi, metadata gambar, maupun identitas akun Anda. PostHog dan Sentry adalah satu-satunya dua tujuan pengiriman, dan saat analitik mati tidak ada yang dikirim ke keduanya.

- tool_used: id alat, status, durasi, kategori, apakah ini alat AI, kode error saat gagal, dan nama langkah untuk alat yang melaporkan satu tahap secara terpisah (langkah analisis Passport Photo).
- pipeline_executed: jumlah langkah, id alat, flag batch, jumlah file, durasi, status.
- ai_bundle_action: id bundle, aksi (`install_started`, `installed`, `install_failed`, `uninstalled`, `reset_environment`, `imported`), durasi, dan saat instalasi gagal, kategori kegagalan dari daftar tetap (`oom`, `network`, `disk`, `checksum`, `cpu_unsupported`, `timeout`, `other`). Output penginstal, path, dan pesan galat tidak pernah dikirim.
- Penggunaan frontend: halaman alat mana yang dibuka, file ditambahkan (hanya jumlah), alat dimulai, unduhan, penyimpanan, pencarian (hanya jumlah hasil), batch diproses.
- Laporan crash: tipe error, pesan error yang sudah disamarkan (nama file, path, email, dan nilai dalam tanda kutip dihapus), source stack dengan basename file, dan untuk alat AI, traceback Python dengan hanya basename file.

Saat administrator pertama kali membuka instans baru, SnapOtter bertanya: "Kirim statistik penggunaan anonim dan laporan crash? File Anda tidak pernah dikirim." Kedua jawaban memiliki bobot yang sama dan tidak ada yang dipilih sebelumnya. Menutup dialog tanpa menjawab membuat analitik tetap mati dan pertanyaan muncul lagi pada kunjungan berikutnya. Hanya administrator yang melihatnya. Dengan `AUTH_ENABLED=false` tidak ada akun dan pengguna lokal bertindak sebagai administrator, sehingga siapa pun yang membuka aplikasi yang menjawabnya. Aplikasi desktop menanyakannya dengan cara yang sama.

Instans yang sudah berjalan sebelum pertanyaan ini ada tidak ditanyai. Instans itu mempertahankan pengaturan analitik yang dimilikinya: aktif, kecuali administrator atau `SNAPOTTER_ANALYTICS_DEFAULT=off` telah mematikannya.

## Peristiwa yang kami kirim (saat diaktifkan) {#events-we-send-when-enabled}

- tool_used: ID alat, status, durasi, kategori, apakah alat AI, dan kode kesalahan jika gagal.
- pipeline_executed: jumlah langkah, ID alat, penanda batch, jumlah file, durasi, status.
- ai_bundle_action: ID bundel, aksi, durasi.
- Penggunaan frontend: halaman alat mana yang dibuka, file yang ditambahkan (hanya jumlah), alat dimulai, unduhan, penyimpanan, pencarian (hanya jumlah hasil), batch diproses.
- Laporan crash: jenis kesalahan, pesan kesalahan yang disamarkan (nama file, path, email, dan nilai dalam tanda kutip dihapus), stack sumber dengan nama dasar file, dan untuk alat AI, traceback Python yang hanya memuat nama dasar file.

## Yang tidak pernah kami kumpulkan {#what-we-never-collect}

- Nama file atau path
- Isi file
- Teks keluaran OCR
- Metadata gambar (EXIF)
- Teks dokumen hasil ekstraksi
- Identitas akun Anda

PostHog melihat alamat IP asal setiap permintaan, seperti server pada umumnya. Proyek PostHog kami membuangnya alih-alih menyimpannya, dan peristiwa server SnapOtter sendiri mengirim nilai pengganti sebagai gantinya.

## Pemberitahuan pembaruan {#update-notices}

Selama analitik aktif, server menanyakan ke PostHog setiap beberapa jam rilis SnapOtter mana yang terbaru, dengan menggunakan ID anonim instans dan versinya. Jika ada rilis yang lebih baru, admin melihat pemberitahuan dengan tautan ke catatan rilis. Jika Anda menutupnya, pemberitahuan tetap tersembunyi sampai rilis berikutnya. Tidak ada yang diinstal atau diunduh untuk Anda, dan saat analitik mati server tidak pernah menanyakannya.

## Mematikannya {#turning-it-off}

Admin: Settings > System > Privacy, matikan "Anonymous Product Analytics". Pengiriman berhenti seketika, untuk seluruh instans. Untuk membuat image yang tidak akan pernah mengirim data, setel build arg `SNAPOTTER_ANALYTICS=off`. `SNAPOTTER_TELEMETRY=off` pada environment server melakukan hal yang sama saat runtime dan mengalahkan jawaban apa pun yang tersimpan di aplikasi.

Untuk menjawab pertanyaan saat pertama kali dijalankan lebih awal, tambahkan `SNAPOTTER_ANALYTICS_DEFAULT=off` (atau `on`) ke environment server sebelum boot pertamanya, maka tidak ada yang ditanyai. Dengan Docker Compose, letakkan di bawah `environment:` milik layanan aplikasi, karena menyetelnya hanya di `.env` tidak sampai ke container.
