---
description: "Herschik pagina's in een PDF met een expliciete paginavolgorde."
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: 5ce87e338e84
---

# Organize PDF {#organize-pdf}

Herschik pagina's in een PDF door de gewenste paginavolgorde op te geven.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| order | string | Ja | - | Gewenste paginavolgorde in qpdf-syntaxis, bijv. `"3,1,2,5-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
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

- Paginabereiken gebruiken qpdf-syntaxis: `3,1,2` herschikt de eerste drie pagina's, en `5-z` voegt pagina's 5 tot en met de laatste pagina toe.
- Pagina's kunnen worden gedupliceerd door ze meer dan één keer op te sommen (bijv. `"1,1,2,3"` dupliceert pagina 1).
- Pagina's die niet in de volgordestring staan, worden weggelaten uit de uitvoer.
