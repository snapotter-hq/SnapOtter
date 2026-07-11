---
description: "Bündelt mehrere Dateien in einem einzigen ZIP-Archiv."
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: b89a01fbf2f0
---

# Create ZIP {#create-zip}

Bündelt mehrere Dateien beliebigen Typs in einem einzigen ZIP-Archiv. Doppelte Dateinamen werden automatisch dedupliziert.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

Akzeptiert Multipart-Formulardaten mit zwei oder mehr Dateien. Es ist kein Einstellungsfeld erforderlich.

## Parameters {#parameters}

Dieses Tool hat keine konfigurierbaren Parameter. Lade 2-50 Dateien beliebigen Typs zum Bündeln hoch.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Erfordert zwischen 2 und 50 Eingabedateien.
- Jeder Dateityp wird akzeptiert; es gibt keine Einschränkungen beim Eingabeformat.
- Wenn mehrere Dateien denselben Namen haben, werden sie automatisch mit numerischen Suffixen dedupliziert.
- Das Ausgabearchiv verwendet die Standard-ZIP-Komprimierung (Deflate).
