---
description: "Rimuovi la protezione con password da un PDF."
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: 95773bf0e5cc
---

# Sblocca PDF {#unlock-pdf}

Rimuovi la protezione con password da un PDF crittografato fornendo la password corretta.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

Accetta dati di form multipart con un file PDF e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| password | string | Yes | - | Password per decrittografare il PDF (1-256 caratteri) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/unlock-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"password": "s3cret"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2500000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Deve essere fornita la password corretta; una password errata restituisce un errore 400.
- Per la decrittografia funziona sia la password utente sia la password del proprietario.
- Le password vengono oscurate dai log di audit.
