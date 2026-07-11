---
description: "Gestileerde tekstoverlays toevoegen met slagschaduwen en achtergrondvakken."
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: 37fc606883ed
---

# Tekstoverlay {#text-overlay}

Voeg gestileerde tekst toe aan afbeeldingen met een optioneel slagschaduw en een semitransparant achtergrondvak. Geschikt voor titels, bijschriften of annotaties op foto's.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

Accepteert multipart form data met een afbeeldingsbestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| text | string | Ja | - | Over te leggen tekst (1 tot 500 tekens) |
| fontSize | number | Nee | `48` | Lettergrootte in pixels (8 tot 200) |
| color | string | Nee | `"#FFFFFF"` | Tekstkleur in hex-formaat (`#RRGGBB`) |
| position | string | Nee | `"bottom"` | Verticale plaatsing: `top`, `center`, `bottom` |
| backgroundBox | boolean | Nee | `false` | Toon een semitransparante achtergrondrechthoek achter de tekst |
| backgroundColor | string | Nee | `"#000000"` | Kleur van het achtergrondvak in hex-formaat (`#RRGGBB`) |
| shadow | boolean | Nee | `true` | Pas een slagschaduw toe achter de tekst |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

Met een achtergrondvak:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Opmerkingen {#notes}

- Tekst wordt altijd horizontaal gecentreerd binnen de afbeelding.
- Het slagschaduw gebruikt een offset van 2px met een vervaging van 3px op 70% zwarte dekking.
- Het achtergrondvak beslaat de volledige afbeeldingsbreedte op 70% dekking, met een hoogte die evenredig is aan de lettergrootte (1.8x).
- Tekst wordt gerenderd via een SVG-composiet, dus het standaard schreefloze lettertype van het systeem wordt gebruikt.
- XML-speciale tekens in de tekst worden veilig geëscaped.
- Het uitvoerformaat komt overeen met het invoerformaat. HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd vóór verwerking.
