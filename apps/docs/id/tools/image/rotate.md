---
description: "Putar gambar pada sudut mana pun dan balik secara horizontal atau vertikal."
i18n_source_hash: af2581d7cd8d
i18n_provenance: human
i18n_output_hash: daef1621cb61
---

# Rotate & Flip {#rotate-flip}

Putar gambar pada sudut sembarang dan/atau balik secara horizontal atau vertikal. Operasi rotasi dan pembalikan dapat digabungkan dalam satu permintaan.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/rotate`

Menerima multipart form data dengan berkas gambar dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | number | No | `0` | Sudut rotasi dalam derajat (searah jarum jam). Menerima nilai numerik apa pun. |
| horizontal | boolean | No | `false` | Balik gambar secara horizontal (cermin) |
| vertical | boolean | No | `false` | Balik gambar secara vertikal |

## Example Request {#example-request}

Putar 90 derajat searah jarum jam:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

Balik secara horizontal:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

Putar dan balik sekaligus:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notes {#notes}

- Rotasi diterapkan terlebih dahulu, lalu operasi pembalikan.
- Rotasi non-90-derajat (mis. 45 derajat) akan memperbesar kanvas agar pas dengan gambar yang diputar, dengan isian transparan atau hitam tergantung format output.
- Nilai umum: 90, 180, 270 untuk rotasi seperempat putaran.
- Orientasi EXIF diterapkan otomatis sebelum diproses, sehingga rotasi relatif terhadap orientasi visual.
