---
description: "Converteer geanimeerde GIF naar WebP en omgekeerd, met behoud van alle frames."
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: 34b5b27685ee
---

# GIF/WebP-converter {#gif-webp-converter}

Converteer geanimeerde GIF-bestanden naar WebP en omgekeerd, met behoud van alle frames en de animatietiming. WebP-animaties zijn doorgaans 25-35% kleiner dan gelijkwaardige GIF's.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

Accepteert multipart-formuliergegevens met een GIF- of WebP-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| quality | integer | Nee | `80` | Uitvoerkwaliteit voor WebP-codering (1-100) |
| lossless | boolean | Nee | `false` | Gebruik lossless WebP-compressie |
| resizePercent | integer | Nee | `100` | Schaal de uitvoer op percentage (10-100) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## Opmerkingen {#notes}

- Alleen `.gif`- en `.webp`-bestanden worden geaccepteerd. Andere afbeeldingsformaten worden door dit hulpmiddel niet ondersteund.
- De conversierichting is automatisch: GIF-invoer produceert WebP-uitvoer, en WebP-invoer produceert GIF-uitvoer.
- De opties `quality` en `lossless` zijn alleen van toepassing bij codering naar WebP. Bij conversie naar GIF gebruikt de uitvoer het standaard GIF-palet.
- Gebruik `resizePercent` om de afmetingen (en bestandsgrootte) van grote animaties te verkleinen.
