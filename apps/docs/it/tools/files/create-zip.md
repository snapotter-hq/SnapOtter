---
description: "Raggruppa più file in un unico archivio ZIP."
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: a3edb0237cf3
---

# Create ZIP {#create-zip}

Raggruppa più file di qualsiasi tipo in un unico archivio ZIP. I nomi di file duplicati vengono deduplicati automaticamente.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

Accetta dati form multipart con due o più file. Non è richiesto alcun campo settings.

## Parameters {#parameters}

Questo strumento non ha parametri configurabili. Carica da 2 a 50 file di qualsiasi tipo da raggruppare.

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

- Richiede tra 2 e 50 file di input.
- È accettato qualsiasi tipo di file; non ci sono restrizioni sul formato di input.
- Se più file condividono lo stesso nome, vengono deduplicati automaticamente con suffissi numerici.
- L'archivio di output usa la compressione ZIP standard (deflate).
