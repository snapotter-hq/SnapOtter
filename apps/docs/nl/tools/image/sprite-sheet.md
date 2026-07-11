---
description: "Meerdere afbeeldingen combineren tot één sprite sheet-raster met framemetadata."
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: 17422b13ebe8
---

# Sprite Sheet {#sprite-sheet}

Combineer meerdere afbeeldingen tot één sprite sheet-raster. Elke afbeelding wordt geschaald naar de afmetingen van de eerste afbeelding en in het raster geplaatst. Retourneert de sprite sheet-afbeelding samen met coördinatenmetadata per frame.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

Accepteert multipart form data met twee of meer afbeeldingsbestanden en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| columns | integer | Nee | `4` | Aantal kolommen in het raster (1-16) |
| padding | integer | Nee | `0` | Opvulling tussen cellen in pixels (0-64) |
| background | string | Nee | `"#ffffff"` | Hex-achtergrondkleur |
| format | string | Nee | `"png"` | Uitvoerformaat: `png`, `webp` of `jpeg` |
| quality | integer | Nee | `90` | Uitvoerkwaliteit (1-100) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Opmerkingen {#notes}

- Accepteert 2 tot 64 afbeeldingen. Alle afbeeldingen worden geschaald naar de afmetingen van de eerste geüploade afbeelding.
- De array `frames` geeft de exacte pixelcoördinaten van elk frame in de uitvoer, geschikt voor CSS-spritedefinities of framemaps voor game-engines.
- Het aantal rijen wordt automatisch berekend op basis van het aantal afbeeldingen en de waarde `columns`.
- Gebruik de parameter `padding` om ruimte tussen cellen toe te voegen. De kleur `background` is zichtbaar in opvulgebieden en eventuele lege cellen aan het einde.
- HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd vóór verwerking.
