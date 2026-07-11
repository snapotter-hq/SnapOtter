---
description: "Aggiungi la protezione con password e crittografia AES-256 a un PDF."
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: 01f3430b9840
---

# Proteggi PDF {#protect-pdf}

Aggiungi la protezione con password a un PDF usando la crittografia AES-256.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

Accetta dati di form multipart con un file PDF e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| userPassword | string | Yes | - | Password richiesta per aprire il PDF (1-256 caratteri) |
| ownerPassword | string | No | Uguale a `userPassword` | Password del proprietario per i permessi (1-256 caratteri) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/protect-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"userPassword": "s3cret", "ownerPassword": "0wn3r"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- La crittografia usa AES-256.
- Se `ownerPassword` viene omesso, assume come predefinito lo stesso valore di `userPassword`.
- Le password vengono oscurate dai log di audit.
- Il PDF crittografato richiede la password utente per l'apertura e la password del proprietario (se diversa) per i permessi completi.
