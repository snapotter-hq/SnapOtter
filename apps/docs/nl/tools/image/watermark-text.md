---
description: "Tekstwatermerken toevoegen met configureerbare positie, dekking, rotatie en tegelpatroon."
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: b67e778f2041
---

# Tekstwatermerk {#text-watermark}

Voeg een tekstwatermerkoverlay toe aan afbeeldingen. Ondersteunt enkele plaatsing in de hoeken/het midden of een herhaald tegelpatroon over de hele afbeelding, met configureerbare lettergrootte, kleur, dekking en rotatie.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

Accepteert multipart form data met een afbeeldingsbestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| text | string | Ja | - | Watermerktekst (1 tot 500 tekens) |
| fontSize | number | Nee | `48` | Lettergrootte in pixels (8 tot 1000) |
| color | string | Nee | `"#000000"` | Tekstkleur in hex-formaat (`#RRGGBB`) |
| opacity | number | Nee | `50` | Dekkingspercentage van de tekst (0 tot 100) |
| position | string | Nee | `"center"` | Plaatsing: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | Nee | `0` | Rotatiehoek van de tekst in graden (-360 tot 360) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

Tegelwatermerk over de hele afbeelding:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Opmerkingen {#notes}

- Het watermerk wordt gerenderd als SVG-tekst en op de afbeelding samengesteld, met behoud van de uitvoerkwaliteit.
- De tegelmodus verdeelt tekstelementen op basis van de lettergrootte (6x horizontale, 4x verticale tussenruimte), met een maximum van 500 elementen.
- Voor hoekposities is de opvulling vanaf de rand gelijk aan de lettergrootte.
- Het gebruikte lettertype is het standaard schreefloze lettertype van het systeem.
- XML-speciale tekens in de tekst (`&`, `<`, `>`, `"`, `'`) worden veilig geëscaped.
- Het uitvoerformaat komt overeen met het invoerformaat. HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd vóór verwerking.
