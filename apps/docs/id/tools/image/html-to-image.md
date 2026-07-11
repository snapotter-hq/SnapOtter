---
description: "Tangkap halaman web atau cuplikan HTML sebagai gambar berkualitas tinggi dengan emulasi perangkat."
i18n_source_hash: 1e49d070ea2e
i18n_provenance: human
i18n_output_hash: 5dc54905d599
---

# HTML to Image {#html-to-image}

Tangkap URL halaman web atau konten HTML mentah sebagai gambar screenshot. Mendukung emulasi perangkat (desktop, tablet, mobile), tangkapan halaman penuh, dan beberapa format output.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

Menerima sebuah **body JSON** (bukan multipart). Tidak diperlukan unggahan file.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | Conditional | - | URL yang akan ditangkap (harus berupa URL valid) |
| html | string | Conditional | - | Konten HTML mentah yang akan dirender (1 hingga 5.000.000 karakter) |
| format | string | No | `"png"` | Format output: `jpg`, `png`, `webp` |
| quality | number | No | `90` | Kualitas output untuk format lossy (1 hingga 100) |
| fullPage | boolean | No | `false` | Tangkap seluruh halaman yang dapat digulir, bukan hanya viewport |
| devicePreset | string | No | `"desktop"` | Emulasi perangkat: `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | No | `1280` | Lebar viewport kustom dalam piksel (320 hingga 3840, digunakan saat devicePreset adalah `custom`) |
| viewportHeight | number | No | `720` | Tinggi viewport kustom dalam piksel (320 hingga 2160, digunakan saat devicePreset adalah `custom`) |

Salah satu dari `url` atau `html` harus disediakan, tetapi tidak keduanya.

### Device Presets {#device-presets}

| Preset | Width | Height | Mobile UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | No |
| `tablet` | 768 | 1024 | No |
| `mobile` | 375 | 812 | Yes |
| `custom` | (ditentukan pengguna) | (ditentukan pengguna) | No |

## Example Request {#example-request}

Tangkap halaman web:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

Render konten HTML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

## Notes {#notes}

- Membutuhkan Chromium terpasang di server. Mengembalikan HTTP 503 bila layanan browser tidak tersedia.
- URL divalidasi terhadap serangan SSRF (alamat jaringan privat/internal diblokir).
- Endpoint ini dibatasi laju hingga 120 permintaan per jam.
- `originalSize` selalu 0 karena alat ini menghasilkan gambar dari URL/HTML.
- Nama file output adalah `screenshot.<format>`.
- Bila halaman terlalu lama dimuat, permintaan mengembalikan HTTP 504 (gateway timeout).
- Bila layanan browser berulang kali crash, ia dinonaktifkan sementara dan mengembalikan HTTP 503 dengan kode `BROWSER_CRASHED`.
