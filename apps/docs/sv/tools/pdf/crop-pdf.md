---
description: "Beskär alla sidor i en PDF med en enhetlig marginal."
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: b595238439ba
---

# Crop PDF {#crop-pdf}

Beskär alla sidor i en PDF genom att tillämpa en enhetlig marginal och trimma innehåll lika mycket från varje kant.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Tar emot multipart-formulärdata med en PDF-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| margin | number | Nej | `20` | Enhetlig beskärningsmarginal i punkter (0-2000) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- Marginalvärdet anges i PDF-punkter (1 punkt = 1/72 tum).
- Samma marginal tillämpas på alla fyra kanterna på varje sida.
- En marginal på `0` tar bort alla befintliga beskärningsmarginaler och visar hela mediarutan.
