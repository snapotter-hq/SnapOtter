---
description: "Simulasikan bagaimana gambar terlihat oleh orang dengan berbagai jenis defisiensi penglihatan warna."
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: d31ae9921a9d
---

# Simulasi Buta Warna {#color-blindness-simulation}

Simulasikan defisiensi penglihatan warna (CVD) untuk melihat pratinjau bagaimana gambar tampak bagi orang dengan berbagai jenis buta warna. Berguna untuk pengujian aksesibilitas desain, bagan, dan UI.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

Menerima data formulir multipart dengan file gambar dan field JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|----------|---------|-------------|
| simulationType | string | Tidak | `"deuteranomaly"` | Jenis defisiensi penglihatan warna yang disimulasikan |

### Jenis Simulasi {#simulation-types}

| Nilai | Kondisi | Deskripsi |
|-------|-----------|-------------|
| `protanopia` | Buta merah | Ketiadaan total sel kerucut merah |
| `deuteranopia` | Buta hijau | Ketiadaan total sel kerucut hijau |
| `tritanopia` | Buta biru | Ketiadaan total sel kerucut biru |
| `protanomaly` | Lemah merah | Sensitivitas kerucut merah berkurang |
| `deuteranomaly` | Lemah hijau | Sensitivitas kerucut hijau berkurang (paling umum) |
| `tritanomaly` | Lemah biru | Sensitivitas kerucut biru berkurang |
| `achromatopsia` | Buta warna total | Ketiadaan total penglihatan warna |
| `blueConeMonochromacy` | Hanya kerucut biru | Hanya kerucut biru yang berfungsi |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## Catatan {#notes}

- Deuteranomali (lemah hijau) adalah default karena merupakan bentuk defisiensi penglihatan warna yang paling umum, memengaruhi sekitar 6% pria.
- Simulasi menggunakan matriks transformasi warna yang memodelkan bagaimana fotoreseptor kerucut yang berkurang atau tidak ada mengubah warna yang dipersepsikan.
- Alat ini bersifat non-destruktif dan hanya menghasilkan pratinjau. Alat ini tidak memodifikasi gambar asli untuk aksesibilitas.
- Format output sesuai dengan format input. Input HEIC, RAW, PSD, dan SVG didekode otomatis sebelum diproses.
