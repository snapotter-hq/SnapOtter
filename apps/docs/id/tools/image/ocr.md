---
description: "Ekstrak teks dari gambar menggunakan pengenalan karakter optik bertenaga AI."
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: 150d020adc2e
---

# OCR / Text Extraction {#ocr-text-extraction}

Ekstrak teks dari gambar menggunakan pengenalan karakter optik bertenaga AI. Mendukung banyak bahasa dan tingkat kualitas.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Processing:** Respons JSON sinkron. Jika `clientJobId` disediakan, progres juga dilaporkan melalui SSE.

**Model bundle:** `ocr` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Berkas gambar (multipart) |
| quality | string | No | `"balanced"` | Tingkat kualitas: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | No | `"auto"` | Petunjuk bahasa: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | No | `true` | Praproses gambar untuk akurasi OCR yang lebih baik |
| engine | string | No | - | Usang. Gunakan `quality` sebagai gantinya. Memetakan `tesseract` ke `fast`, `paddleocr` ke `balanced` |

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
  "engine": "paddleocr-vl"
}
```

### Progress (SSE, optional) {#progress-sse-optional}

Jika field form `clientJobId` disediakan, event progres dialirkan:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Notes {#notes}

- Membutuhkan model bundle `ocr` terpasang (5-6 GB).
- OCR mengembalikan teks yang diekstraksi secara langsung, bukan URL unduhan gambar.
- Menggunakan rantai fallback: jika tingkat kualitas lebih tinggi crash (mis., PaddleOCR segfault), akan otomatis mencoba ulang dengan tingkat yang lebih rendah.
- Jika suatu tingkat mengembalikan teks kosong tanpa crash, juga akan jatuh ke tingkat berikutnya.
- Tingkat kualitas dipetakan ke engine: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL.
- Mendukung format input HEIC/HEIF, RAW, TGA, PSD, EXR, dan HDR via dekode otomatis.
