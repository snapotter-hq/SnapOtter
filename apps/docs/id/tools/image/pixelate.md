---
description: "Terapkan efek pikselasi ke seluruh gambar atau area tertentu."
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: 64397dfa435a
---

# Pixelate {#pixelate}

Terapkan efek pikselasi ke seluruh gambar atau area persegi panjang tertentu. Berguna untuk mengaburkan konten sensitif seperti wajah, pelat nomor, atau informasi pribadi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

Menerima multipart form data dengan berkas gambar dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| blockSize | integer | No | `12` | Ukuran blok piksel (2-128); nilai lebih besar menghasilkan pikselasi lebih kasar |
| region | object | No | - | Batasi pikselasi ke sebuah persegi panjang (lihat di bawah) |

### Region Object {#region-object}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| left | integer | Yes | Offset kiri dalam piksel (>= 0) |
| top | integer | Yes | Offset atas dalam piksel (>= 0) |
| width | integer | Yes | Lebar area dalam piksel (>= 1) |
| height | integer | Yes | Tinggi area dalam piksel (>= 1) |

## Example Request {#example-request}

Pikselasikan seluruh gambar:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

Pikselasikan area tertentu:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notes {#notes}

- Saat `region` dihilangkan, seluruh gambar dipikselasi.
- Koordinat area dalam piksel relatif terhadap sudut kiri atas gambar. Area harus berada dalam batas gambar.
- Format output mengikuti format input. Input HEIC, RAW, PSD, dan SVG didekode secara otomatis sebelum diproses.
