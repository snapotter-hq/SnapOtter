---
description: "Haal geselecteerde pagina's uit een PDF in een nieuw document."
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: 6481de8aa202
---

# Extract Pages {#extract-pages}

Haal geselecteerde pagina's uit een PDF in een nieuw, kleiner document.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

Accepteert multipart-formuliergegevens met een PDF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| range | string | Ja | - | Paginabereik in qpdf-syntaxis, bijv. `"1-5,8,10-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notes {#notes}

- Paginabereiken gebruiken qpdf-syntaxis: `1-5` voor pagina's 1 tot en met 5, `z` voor de laatste pagina, en komma's om bereiken te combineren (bijv. `1-3,7,10-z`).
- De geëxtraheerde pagina's behouden hun oorspronkelijke opmaak, annotaties en links.
