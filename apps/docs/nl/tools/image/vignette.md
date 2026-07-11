---
description: "Een vignet-effect toevoegen met aanpasbare sterkte, kleur en positie."
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: ea25d8e3b2af
---

# Vignet {#vignette}

Voeg een vignet-effect toe dat de randen van een afbeelding donkerder maakt of tint. Ondersteunt aanpasbare sterkte, kleur, radius, zachtheid, rondheid en middenpunt.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vignette`

Accepteert multipart form data met een afbeeldingsbestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| strength | number | Nee | `0.5` | Dekking van het vignet (0.1-1) |
| color | string | Nee | `"#000000"` | Hex-kleur van het vignet |
| radius | integer | Nee | `70` | Buitenradius als percentage van de halve diagonaal (0-100) |
| softness | integer | Nee | `50` | Verzachting van de rand (0-100); hogere waarden geven een geleidelijkere overgang |
| roundness | integer | Nee | `100` | Vorm: 100 = cirkel, 0 = ellips die overeenkomt met de beeldverhouding |
| centerX | integer | Nee | `50` | Horizontale middenpositie als percentage (0-100) |
| centerY | integer | Nee | `50` | Verticale middenpositie als percentage (0-100) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## Opmerkingen {#notes}

- Een kleinere `radius` maakt meer van de afbeelding donkerder; een grotere radius beperkt het vignet tot de uiterste randen.
- Gebruik een niet-zwarte `color` (bijv. witte of sepiatinten) voor creatieve vignet-effecten.
- Door `centerX` en `centerY` aan te passen, kun je het heldere gebied buiten het midden plaatsen, wat handig is om de aandacht te vestigen op een onderwerp dat niet in het midden van het beeld staat.
- Het uitvoerformaat komt overeen met het invoerformaat. HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd vóór verwerking.
