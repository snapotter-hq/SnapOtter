---
description: "Konversi antar JSON dan XML, kedua arah."
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: d1e21e81a2e4
---

# JSON to XML {#json-to-xml}

Konversi antar format JSON dan XML dalam kedua arah. Unggah file JSON untuk mendapatkan XML, atau unggah file XML untuk mendapatkan JSON.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

Menerima multipart form data berisi file JSON atau XML dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | Cetak-rapi output dengan indentasi |

## Example Request {#example-request}

JSON ke XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML ke JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Notes {#notes}

- Arah konversi terdeteksi otomatis dari ekstensi file input: `.json` menghasilkan `.xml`, dan `.xml` menghasilkan `.json`.
- Parameter `pretty` berlaku untuk kedua arah. Ketika `false`, output menjadi kompak tanpa indentasi.
- Atribut XML dan struktur bersarang dipertahankan selama konversi bolak-balik jika memungkinkan.
