---
description: "Combineer meerdere afbeeldingen tot rastercollages met meer dan 25 sjablonen, aanpasbare tussenruimtes en hoeken, en pannen en zoomen per cel."
i18n_source_hash: cd50a782239d
i18n_provenance: human
i18n_output_hash: a9345e0095b7
---

# Collage & Raster {#collage-grid}

Combineer meerdere afbeeldingen tot fraaie rastercollages met meer dan 25 sjablonen. Ondersteunt lay-outs van 2 tot 9 afbeeldingen met aanpasbare tussenruimte, hoekstraal, achtergrondkleur en pan/zoom-instellingen per cel.

## API-eindpunt {#api-endpoint}

`POST /api/v1/tools/image/collage`

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| templateId | string | Ja | - | Sjabloonlay-out-ID (bijv. `2-h-equal`, `3-left-large`, `4-grid`, `9-grid`) |
| cells | array | Nee | - | Array met instellingen per cel met `imageIndex`, `panX`, `panY`, `zoom`, `objectFit` |
| cells[].imageIndex | integer | Ja | - | Index van de afbeelding die in deze cel wordt geplaatst (0-gebaseerd) |
| cells[].panX | number | Nee | 0 | Horizontale pan-offset (-100 tot 100) |
| cells[].panY | number | Nee | 0 | Verticale pan-offset (-100 tot 100) |
| cells[].zoom | number | Nee | 1 | Zoomniveau (1 tot 10) |
| cells[].objectFit | string | Nee | `"cover"` | Hoe de afbeelding de cel vult: `cover` of `contain` |
| gap | number | Nee | 8 | Tussenruimte tussen cellen in pixels (0 tot 500) |
| cornerRadius | number | Nee | 0 | Hoekstraal voor elke cel in pixels (0 tot 500) |
| backgroundColor | string | Nee | `"#FFFFFF"` | Achtergrondkleur als hex of `"transparent"` |
| aspectRatio | string | Nee | `"free"` | Beeldverhouding van het canvas: `free`, `1:1`, `4:3`, `3:2`, `16:9`, `9:16`, `4:5` |
| outputFormat | string | Nee | `"png"` | Uitvoerformaat: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Nee | 90 | Uitvoerkwaliteit (1 tot 100) |

## Beschikbare sjablonen {#available-templates}

| Sjabloon-ID | Afbeeldingen | Lay-out |
|-------------|--------|--------|
| `2-h-equal` | 2 | Twee gelijke kolommen |
| `2-v-equal` | 2 | Twee gelijke rijen |
| `2-h-left-large` | 2 | Links 2/3, rechts 1/3 |
| `2-h-right-large` | 2 | Links 1/3, rechts 2/3 |
| `3-left-large` | 3 | Groot links, twee gestapeld rechts |
| `3-right-large` | 3 | Twee gestapeld links, groot rechts |
| `3-top-large` | 3 | Groot boven, twee kolommen onder |
| `3-h-equal` | 3 | Drie gelijke kolommen |
| `3-v-equal` | 3 | Drie gelijke rijen |
| `4-grid` | 4 | 2x2-raster |
| `4-left-large` | 4 | Groot links, drie gestapeld rechts |
| `4-top-large` | 4 | Groot boven, drie kolommen onder |
| `4-bottom-large` | 4 | Drie kolommen boven, groot onder |
| `5-top2-bottom3` | 5 | Twee boven, drie onder |
| `5-top3-bottom2` | 5 | Drie boven, twee onder |
| `5-left-large` | 5 | Groot links, vier gestapeld rechts |
| `5-center-large` | 5 | Groot in het midden, vier hoeken |
| `6-grid-2x3` | 6 | 2 kolommen x 3 rijen |
| `6-grid-3x2` | 6 | 3 kolommen x 2 rijen |
| `6-top-large` | 6 | Groot boven, vijf kolommen onder |
| `7-mosaic` | 7 | Mozaïeklay-out |
| `8-mosaic` | 8 | Mozaïeklay-out |
| `9-grid` | 9 | 3x3-raster |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## Opmerkingen {#notes}

- Upload meerdere afbeeldingsbestanden in het multipart-verzoek. De afbeeldingen worden in uploadvolgorde aan de sjablooncellen toegewezen.
- Als er meer afbeeldingen worden geüpload dan het sjabloon ondersteunt, worden de extra afbeeldingen genegeerd.
- Ondersteunt HEIC-, RAW-, PSD- en SVG-invoerformaten (automatisch gedecodeerd).
- De basisgrootte van het canvas is 2400px aan de langste zijde, geschaald op basis van de gekozen beeldverhouding.
- Als `aspectRatio` `"free"` is, staat het canvas standaard op 4:3 (2400x1800).
- De `panX`/`panY`-waarden per cel verschuiven het uitsnijvenster binnen de cel. Een waarde van 100 verplaatst volledig naar de ene rand, -100 naar de andere.
- De `"transparent"`-achtergrondkleur blijft alleen behouden bij de uitvoerformaten `png`, `webp` of `avif`.
