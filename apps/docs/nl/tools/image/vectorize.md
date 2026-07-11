---
description: "Rasterafbeeldingen converteren naar SVG met zwart-wit (potrace) en volledige-kleur, meerlaagse vectorisatie."
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: d0f566482ccd
---

# Afbeelding naar SVG {#image-to-svg}

Vectoriseer rasterafbeeldingen naar SVG met traceeralgoritmen. Ondersteunt zwart-wittracering (potrace) en volledige-kleur, meerlaagse vectorisatie.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| colorMode | string | Nee | `"bw"` | Traceermodus: `bw` (zwart-wit) of `color` (meerkleurige lagen) |
| threshold | number | Nee | 128 | Helderheidsdrempel voor de zwart-witmodus (0 tot 255). Pixels daaronder worden zwart. |
| colorPrecision | number | Nee | 6 | Precisie van kleurkwantisatie voor de kleurmodus (1 tot 16). Hogere waarden produceren meer onderscheidende kleurlagen. |
| layerDifference | number | Nee | 6 | Minimaal kleurverschil tussen lagen in de kleurmodus (1 tot 128) |
| filterSpeckle | number | Nee | 4 | Minimale oppervlakte voor getraceerde vormen in pixels (1 tot 256). Verwijdert ruis/spikkels. |
| pathMode | string | Nee | `"spline"` | Padvergladding: `none` (gekarteld), `polygon` (rechte segmenten), `spline` (vloeiende curves) |
| cornerThreshold | number | Nee | 60 | Hoekdrempel voor hoekdetectie in de kleurmodus (0 tot 180 graden) |
| invert | boolean | Nee | `false` | De afbeelding vóór het traceren inverteren (zwart/wit omwisselen) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### Kleurvectorisatie {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## Opmerkingen {#notes}

- De uitvoer is altijd een SVG-bestand, ongeacht het invoerformaat.
- Ondersteunt HEIC-, RAW-, PSD- en SVG-invoerformaten (automatisch gedecodeerd naar raster vóór het traceren).
- De zwart-witmodus gebruikt het potrace-algoritme. De afbeelding wordt eerst omgezet naar grijswaarden en vervolgens met een drempel gezet naar puur zwart/wit voordat er wordt getraceerd.
- De kleurmodus gebruikt een meerlaagse aanpak: de afbeelding wordt gekwantiseerd in kleurlagen, elk apart getraceerd en gestapeld in de SVG-uitvoer.
- Lagere `filterSpeckle`-waarden behouden meer detail, maar produceren grotere SVG-bestanden met meer paden.
- De instelling `pathMode` heeft een aanzienlijke invloed op de bestandsgrootte: `none` produceert de meeste paden, `spline` produceert de vloeiendste (en meestal kleinste) uitvoer.
- Gebruik voor de beste resultaten met logo's en pictogrammen de zwart-witmodus met een schone invoer met hoog contrast. Gebruik voor foto's of illustraties de kleurmodus met een hogere `colorPrecision`.
