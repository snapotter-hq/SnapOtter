---
description: "Verwijder specifieke pagina's uit een PDF."
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: 93e5d4704f38
---

# Remove Pages {#remove-pages}

Verwijder specifieke pagina's uit een PDF, waarbij alle overige pagina's intact blijven.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

Accepteert multipart-formuliergegevens met een PDF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| pages | string | Ja | - | Te verwijderen paginabereik in qpdf-syntaxis, bijv. `"3,5-7"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- Je kunt niet elke pagina uit een document verwijderen; er moet minstens één pagina overblijven.
- Paginabereiken gebruiken qpdf-syntaxis: `3` voor een enkele pagina, `5-7` voor een bereik, en komma's om te combineren (bijv. `1,3,5-7`).
