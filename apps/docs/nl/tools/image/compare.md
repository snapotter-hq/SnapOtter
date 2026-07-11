---
description: "Vergelijk twee afbeeldingen naast elkaar met een verschilvisualisatie op pixelniveau en een gelijkeniscore."
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: 52cfa5d24e22
---

# Afbeeldingen vergelijken {#image-compare}

Upload twee afbeeldingen om een verschilkaart op pixelniveau en een numeriek gelijkenispercentage te berekenen. De uitvoer is een verschilafbeelding die gewijzigde gebieden in het rood markeert.

## API-eindpunt {#api-endpoint}

`POST /api/v1/tools/image/compare`

Accepteert multipart-formuliergegevens met **twee** afbeeldingsbestanden. Er is geen instellingenveld nodig.

## Parameters {#parameters}

Deze tool heeft geen configureerbare parameters. Upload precies twee afbeeldingsbestanden.

| Veld | Type | Vereist | Beschrijving |
|-------|------|----------|-------------|
| file (eerste) | file | Ja | De eerste afbeelding |
| file (tweede) | file | Ja | De tweede afbeelding |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## Antwoordvelden {#response-fields}

| Veld | Type | Beschrijving |
|-------|------|-------------|
| jobId | string | Taakidentificatie voor het downloaden van de verschilafbeelding |
| similarity | number | Procentuele gelijkenis tussen de twee afbeeldingen (0 tot 100) |
| dimensions | object | Breedte en hoogte gebruikt voor de vergelijking |
| downloadUrl | string | URL om de gegenereerde verschilafbeelding te downloaden |
| originalSize | number | Gecombineerde grootte van beide invoerafbeeldingen in bytes |
| processedSize | number | Grootte van de verschiluitvoerafbeelding in bytes |

## Opmerkingen {#notes}

- Beide afbeeldingen worden vóór de vergelijking naar dezelfde afmetingen verkleind (het maximum van elke as).
- De verschilafbeelding markeert verschillen in het rood met een dekking die evenredig is aan de mate van verandering. Identieke of vrijwel identieke pixels (verschil < 10) worden weergegeven als semitransparante versies van het origineel.
- De gelijkenis wordt berekend als de inverse van het gemiddelde pixelverschil over alle pixels, uitgedrukt als percentage.
- Een gelijkenis van 100% betekent dat de afbeeldingen pixel-identiek zijn (bij de vergelijkingsresolutie).
- De verschiluitvoer is altijd in PNG-formaat, ongeacht de invoerformaten.
- Beide afbeeldingen worden gevalideerd en gedecodeerd (HEIC, RAW, PSD, SVG worden ondersteund) vóór de vergelijking.
- De EXIF-oriëntatie wordt automatisch toegepast op beide afbeeldingen vóór de verwerking.
