---
description: "Ekstrak teks dari gambar secara lokal dengan Tesseract bawaan atau runtime RapidOCR opsional dengan akurasi tinggi."
i18n_output_hash: 18a92d67d692
i18n_source_hash: 01c6fa6aebe7
i18n_provenance: human
---

# OCR / Text Extraction {#ocr-text-extraction}

Ekstrak teks dari gambar tanpa mengirim gambar ke layanan eksternal. Tingkat `fast` bawaan menggunakan Tesseract. Tingkat opsional `balanced` dan `best` menggunakan RapidOCR dengan model PP-OCR ONNX yang disematkan.


<!-- korean-ocr-contract:start -->
::: info Kompatibilitas OCR bahasa Korea
OCR Cepat mendukung `auto`, `en`, `de`, `es`, `fr`, `zh`, dan `ja`, tetapi tidak mendukung bahasa Korea (`ko`). Bahasa Korea memerlukan paket OCR Akurat dan `balanced` atau `best`. Paket berjalan pada kontainer resmi Linux amd64 dan arm64, termasuk host NVIDIA dengan OCR tetap memakai CPU. Sistem yang tidak didukung menerima kesalahan kompatibilitas yang jelas dan tidak pernah diam-diam kembali ke `fast`. Bahasa Korea dengan `fast` atau alias lama `tesseract` ditolak sebelum antre dengan `FEATURE_INCOMPATIBLE` dan `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Memproses:** Mengembalikan `200` dengan JSON ketika OCR selesai di dalam jendela sinkron. Pekerjaan yang lebih lama menghasilkan `202`; ikuti aliran kemajuan SSE pekerjaan ke peristiwa terminalnya, yang `result`-nya berisi bidang OCR yang sama.

**Paket OCR yang akurat:** Waktu proses `ocr` opsional (sekitar 208-234 MiB untuk diunduh dan 409-488 MiB diinstal, bergantung pada target). `fast` tidak memerlukan paket ini; penginstal memverifikasi ukuran pasti yang terikat oleh indeks yang ditandatangani.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Ya | - | File gambar (multibagian), hingga 512 MiB dikodekan dan 40 megapiksel dikodekan; batas unggah operator yang lebih rendah masih berlaku |
| quality | string | TIDAK | Dinamis | Tingkat kualitas: `fast` (Tesseract), `balanced` (RapidOCR dengan model PP-OCRv6 kecil), atau `best` (model PP-OCRv6 medium dengan akurasi lebih tinggi dengan penilaian varian yang dikalibrasi) |
| language | string | No | `"auto"` | Petunjuk bahasa: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | TIDAK | Bergantung pada tingkatan | Tingkatkan kontras lokal sebelum pengenalan. Fast menerapkannya secara langsung; Seimbang dan Terbaik mempertahankan varian hanya jika penilaian yang dikalibrasi meningkatkan hasilnya. Defaultnya adalah `true` untuk `best` dan `false` untuk `fast`/`balanced` |
| engine | string | TIDAK | - | Alias ​​​​kompatibilitas yang tidak digunakan lagi. Gunakan `quality` sebagai gantinya. `tesseract` dipetakan ke `fast`; nilai `paddleocr` lama dipetakan ke `balanced` tetapi tidak memuat PaddlePaddle |

Jika `quality` dan `engine` tidak diberikan, SnapOtter memilih tingkat terbaik yang tersedia dengan urutan `best`, `balanced`, lalu `fast`. Untuk bahasa Korea, `fast` tidak pernah dipilih; sistem memakai `best`, lalu `balanced`, atau mengembalikan kesalahan instalasi maupun kompatibilitas runtime akurat.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "rapidocr-onnx",
  "requestedQuality": "best",
  "actualQuality": "best",
  "device": "cpu",
  "provider": "CPUExecutionProvider",
  "degraded": false,
  "warnings": [],
  "runtimeVersion": "2.1.0",
  "modelVersion": "PP-OCRv6-best-v1-medium"
}
```

### Progress (SSE, optional) {#progress-sse-optional}

Jika bidang formulir `clientJobId` disediakan, peristiwa kemajuan akan dialirkan. Respons `202` berarti klien harus membiarkan aliran tetap terbuka hingga peristiwa terminal `complete` atau `failed`:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Notes {#notes}

- `fast` selalu tersedia dalam gambar SnapOtter yang didukung. `balanced` dan `best` memerlukan paket OCR opsional yang akurat.
- Tesseract bawaan menambahkan sekitar 25 MiB ke gambar resmi. Paket akurat disimpan di `/data/ai`, bukan dimasukkan ke dalam gambar.
- Paket akurat diterbitkan untuk wadah resmi Linux amd64 dan arm64. Sengaja menggunakan penyedia ONNX Runtime CPU, termasuk pada host NVIDIA, sehingga tidak bergantung pada pustaka CUDA atau kompatibilitas GPU. Penginstalan bare-metal sumber dan bawaan menggunakan Fast OCR kecuali mereka menyediakan runtime yang kompatibel.
- OCR mengembalikan teks yang diekstraksi secara langsung, bukan URL unduhan gambar.
- SnapOtter menghormati tingkatan yang diminta secara eksplisit. Jika `balanced` atau `best` tidak tersedia, API mengembalikan `501` dengan `FEATURE_NOT_INSTALLED` atau `FEATURE_INCOMPATIBLE`; itu tidak pernah secara diam-diam menurunkan versi permintaan ke tingkat lain.
- Hasil kosong yang berhasil tetap merupakan hasil kosong. Kegagalan waktu proses menghasilkan kesalahan alih-alih mencoba ulang dengan mesin berkualitas rendah.
- Responsnya melaporkan `requestedQuality` dan `actualQuality`, ditambah mesin, perangkat, penyedia, waktu proses dan versi model, serta peringatan apa pun.
- Mendukung format input HEIC/HEIF, RAW, TGA, PSD, EXR, dan HDR via dekode otomatis.
- Input berkode berukuran besar mengembalikan `413`. Gambar di atas 40 megapiksel dan respons OCR yang melampaui batas keluarannya akan ditolak dan bukan diproses sebagian.
