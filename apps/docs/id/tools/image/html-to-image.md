---
description: "Tangkap halaman web atau cuplikan HTML sebagai gambar berkualitas tinggi dengan emulasi perangkat."
i18n_source_hash: 307493f63631
i18n_provenance: machine
i18n_output_hash: 2f8279380b6f
i18n_hash_version: 2
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
| clientJobId | string | No | - | ID job Anda sendiri, agar Anda bisa membuka stream progres sebelum jawaban tiba |

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

### Slow pages {#slow-pages}

Penangkapan berjalan sebagai job dalam antrean. Penangkapan yang selesai dalam jendela tunggu sinkron dijawab dengan `200` beserta hasil di atas. Yang lebih lambat dijawab dengan `202` dan sebuah ID job:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true,
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress"
}
```

Ikuti `progressUrl` (Server-Sent Events) sampai job selesai. Event selesai membawa objek hasil yang sama dengan jawaban `200`. Anda dapat membatalkan job dengan `POST /api/v1/jobs/{jobId}/cancel`.

::: warning Berubah setelah 2.3.0
Hingga 2.3.0 endpoint ini selalu menahan permintaan sampai penangkapan selesai dan menjawab `200`. Skrip yang hanya menangani `200` sebaiknya juga menangani `202`.
:::

## Notes {#notes}

- Membutuhkan Chromium terpasang di server. Mengembalikan HTTP 503 bila layanan browser tidak tersedia.
- URL divalidasi terhadap serangan SSRF (alamat jaringan privat/internal diblokir).
- Endpoint ini dibatasi laju hingga 120 permintaan per jam.
- `originalSize` selalu 0 karena alat ini menghasilkan gambar dari URL/HTML.
- Nama file output adalah `screenshot.<format>`.
- Bila halaman terlalu lama dimuat, penangkapan gagal dengan HTTP 504 (gateway timeout).
- Bila layanan browser berulang kali crash, ia dinonaktifkan sementara dan penangkapan gagal dengan HTTP 503 dan kode `BROWSER_CRASHED`.
- Crash browser (HTTP 503) dicoba ulang satu kali sebelum kegagalan dilaporkan, seperti job gambar antrean lainnya. Timeout pemuatan halaman tidak dicoba ulang.
- Penangkapan yang sudah menjawab `202` melaporkan kegagalan di stream progresnya, bukan di status HTTP.
