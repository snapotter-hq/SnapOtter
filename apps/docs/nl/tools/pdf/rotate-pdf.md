---
description: "Roteer pagina's in een PDF met 90, 180 of 270 graden."
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: 0f2de7830082
---

# Rotate PDF {#rotate-pdf}

Roteer alle of geselecteerde pagina's in een PDF met een opgegeven hoek.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| angle | integer | Nee | `90` | Rotatiehoek: `90`, `180`, of `270` |
| range | string | Nee | `"1-z"` | Paginabereik in qpdf-syntaxis, bijv. `"1-5,8"` (`"1-z"` = alle pagina's) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Rotatie is met de klok mee.
- Paginabereiken gebruiken qpdf-syntaxis: `1-5` voor pagina's 1 tot en met 5, `z` voor de laatste pagina, en komma's om bereiken te combineren.
- Het standaardbereik `"1-z"` roteert alle pagina's.
