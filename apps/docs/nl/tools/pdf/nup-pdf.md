---
description: "Rangschik meerdere PDF-pagina's per vel (2-up, 4-up, enz.)."
i18n_source_hash: 972bf997c95c
i18n_provenance: human
i18n_output_hash: 0bc3216f7107
---

# Pagina's per vel (N-up) {#n-up-pdf}

Rangschik meerdere pagina's per vel om papier te besparen bij het afdrukken, zoals 2-up- of 4-up-indelingen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Nee | `2` | Pagina's per vel: `2`, `3`, `4`, `8`, `9`, `12`, of `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- Pagina's worden in leesvolgorde gerangschikt (van links naar rechts, van boven naar beneden).
- De uitvoerpaginagrootte komt overeen met het origineel; individuele pagina's worden verkleind om in het raster te passen.
- Een document van 20 pagina's met `perSheet: 4` produceert een uitvoer van 5 pagina's.
