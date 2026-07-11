---
description: "Voeg een tekstwatermerk toe aan elke pagina van een PDF."
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: 6376fffd7b48
---

# Watermark PDF {#watermark-pdf}

Stempel een tekstwatermerk op elke pagina van een PDF met configureerbare positie, grootte, dekking en rotatie.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| text | string | Ja | - | Watermerktekst (1-200 tekens) |
| position | string | Nee | `"c"` | Plaatsing op de pagina: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | Nee | `48` | Lettergrootte in punten (6-72) |
| opacity | number | Nee | `0.3` | Watermerkdekking (0.05-1) |
| rotation | number | Nee | `45` | Rotatiehoek in graden (-180 tot 180) |

### Position Values {#position-values}

- `tl` linksboven, `tc` middenboven, `tr` rechtsboven
- `l` midden-links, `c` midden, `r` midden-rechts
- `bl` linksonder, `bc` middenonder, `br` rechtsonder

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
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

- Het watermerk wordt weergegeven als een tekstoverlay op elke pagina.
- Dezelfde watermerktekst, positie en stijl worden uniform op alle pagina's toegepast.
- Gebruik lagere dekkingswaarden (0.1-0.3) voor subtiele watermerken die de inhoud niet verhullen.
