---
description: "Konversi antara YAML dan JSON, dua arah."
i18n_source_hash: ef0c9b633797
i18n_provenance: human
i18n_output_hash: 5e593eb54bf0
---

# Konversi YAML / JSON {#yaml-json}

Konversi antara format YAML dan JSON dalam kedua arah. Unggah berkas YAML untuk mendapatkan JSON, atau unggah berkas JSON untuk mendapatkan YAML.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

Menerima data formulir multipart dengan berkas YAML atau JSON. Tidak diperlukan bidang pengaturan.

## Parameter {#parameters}

Alat ini tidak memiliki parameter yang dapat dikonfigurasi. Arah konversi ditentukan oleh ekstensi berkas input.

## Contoh Permintaan {#example-request}

YAML ke JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON ke YAML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Catatan {#notes}

- Arah konversi dideteksi secara otomatis dari ekstensi berkas input: `.yaml` atau `.yml` menghasilkan `.json`, dan `.json` menghasilkan `.yaml`.
- Baik ekstensi `.yaml` maupun `.yml` diterima.
- Hanya dokumen pertama dalam berkas YAML multi-dokumen yang dikonversi; dokumen tambahan yang dipisahkan oleh `---` diabaikan.
