---
description: "Snijd alle pagina's van een PDF bij met één marge voor elke rand, een aparte marge per rand of tot een gebied."
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: d123d3dc5ef7
i18n_hash_version: 2
---

# Crop PDF {#crop-pdf}

Snijd alle pagina's van een PDF bij met één marge op elke rand, een aparte marge per rand, of tot een gebied zoals een verzendlabel dat in één hoek van het vel is afgedrukt.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| mode | string | Nee | `uniform` | `uniform`, `sides` of `region` |
| margin | number | Nee | `20` | Modus `uniform`: bijsnijmarge voor elke rand in punten (0-2000) |
| top, right, bottom, left | number | Nee | `0` | Modus `sides`: bijsnijmarge voor elke rand afzonderlijk in punten (0-2000) |
| x, y | number | Nee | `0` | Modus `region`: afstand van het gebied tot de linker- en bovenrand van de pagina in punten |
| width, height | number | Nee | `288`, `432` | Modus `region`: grootte van het gebied in punten (een label van 4x6 in) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

Houd alleen het label van 4x6 in linksboven op elke pagina over:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
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

- Alle waarden zijn in PDF-punten (1 punt = 1/72 inch). Een US Letter-pagina is 612 x 792 punten.
- Elke modus leest alleen zijn eigen velden, dus een verzoek dat alleen `margin` verstuurt blijft werken.
- Een gebied wordt gemeten vanaf de linkerbovenhoek van elke pagina en moet op elke pagina passen. Marges moeten een deel van elke pagina overlaten. Anders mislukt het verzoek met `400`.
- Op een pagina die gedraaid wordt weergegeven, verwijzen posities en randen naar de pagina zoals die wordt weergegeven, dus de linkerbovenhoek van een gebied is de linkerbovenhoek van de gedraaide pagina.
- Elke modus meet vanaf de volledige media box, dus een pagina die al is bijgesneden opnieuw bijsnijden begint weer bij de volledige pagina. Een uniforme marge van `0` toont de volledige media box.
