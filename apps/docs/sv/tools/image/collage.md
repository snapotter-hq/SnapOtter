---
description: "Kombinera flera bilder till rutnätscollage med 25+ mallar, justerbara mellanrum och hörn samt panorering och zoom per cell."
i18n_source_hash: cd50a782239d
i18n_provenance: human
i18n_output_hash: 8f2a14aa47e4
---

# Collage & Rutnät {#collage-grid}

Kombinera flera bilder till snygga rutnätscollage med 25+ mallar. Stöder layouter för 2-9 bilder med anpassningsbart mellanrum, hörnradie, bakgrundsfärg och kontroller för panorering/zoom per cell.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/collage`

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| templateId | string | Ja | - | Mallens layout-ID (t.ex. `2-h-equal`, `3-left-large`, `4-grid`, `9-grid`) |
| cells | array | Nej | - | Array med inställningar per cell med `imageIndex`, `panX`, `panY`, `zoom`, `objectFit` |
| cells[].imageIndex | integer | Ja | - | Index för bilden som ska placeras i denna cell (0-baserat) |
| cells[].panX | number | Nej | 0 | Horisontell panoreringsförskjutning (-100 till 100) |
| cells[].panY | number | Nej | 0 | Vertikal panoreringsförskjutning (-100 till 100) |
| cells[].zoom | number | Nej | 1 | Zoomnivå (1 till 10) |
| cells[].objectFit | string | Nej | `"cover"` | Hur bilden fyller cellen: `cover` eller `contain` |
| gap | number | Nej | 8 | Mellanrum mellan celler i pixlar (0 till 500) |
| cornerRadius | number | Nej | 0 | Hörnradie för varje cell i pixlar (0 till 500) |
| backgroundColor | string | Nej | `"#FFFFFF"` | Bakgrundsfärg som hex eller `"transparent"` |
| aspectRatio | string | Nej | `"free"` | Ritytans bildförhållande: `free`, `1:1`, `4:3`, `3:2`, `16:9`, `9:16`, `4:5` |
| outputFormat | string | Nej | `"png"` | Utdataformat: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Nej | 90 | Utdatakvalitet (1 till 100) |

## Tillgängliga mallar {#available-templates}

| Mall-ID | Bilder | Layout |
|-------------|--------|--------|
| `2-h-equal` | 2 | Två lika kolumner |
| `2-v-equal` | 2 | Två lika rader |
| `2-h-left-large` | 2 | Vänster 2/3, höger 1/3 |
| `2-h-right-large` | 2 | Vänster 1/3, höger 2/3 |
| `3-left-large` | 3 | Stor till vänster, två staplade till höger |
| `3-right-large` | 3 | Två staplade till vänster, stor till höger |
| `3-top-large` | 3 | Stor upptill, två kolumner nedtill |
| `3-h-equal` | 3 | Tre lika kolumner |
| `3-v-equal` | 3 | Tre lika rader |
| `4-grid` | 4 | 2x2-rutnät |
| `4-left-large` | 4 | Stor till vänster, tre staplade till höger |
| `4-top-large` | 4 | Stor upptill, tre kolumner nedtill |
| `4-bottom-large` | 4 | Tre kolumner upptill, stor nedtill |
| `5-top2-bottom3` | 5 | Två upptill, tre nedtill |
| `5-top3-bottom2` | 5 | Tre upptill, två nedtill |
| `5-left-large` | 5 | Stor till vänster, fyra staplade till höger |
| `5-center-large` | 5 | Stor i mitten, fyra i hörnen |
| `6-grid-2x3` | 6 | 2 kolumner x 3 rader |
| `6-grid-3x2` | 6 | 3 kolumner x 2 rader |
| `6-top-large` | 6 | Stor upptill, fem kolumner nedtill |
| `7-mosaic` | 7 | Mosaiklayout |
| `8-mosaic` | 8 | Mosaiklayout |
| `9-grid` | 9 | 3x3-rutnät |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## Anteckningar {#notes}

- Ladda upp flera bildfiler i multipart-begäran. Bilderna tilldelas mallcellerna i uppladdningsordning.
- Om fler bilder laddas upp än vad mallen stöder ignoreras de extra bilderna.
- Stöder indataformaten HEIC, RAW, PSD och SVG (avkodas automatiskt).
- Ritytans basstorlek är 2400px på den längsta sidan, skalad efter valt bildförhållande.
- När `aspectRatio` är `"free"` blir ritytan som standard 4:3 (2400x1800).
- Värden för `panX`/`panY` per cell förskjuter beskärningsfönstret inom cellen. Värdet 100 flyttar helt till en kant, -100 till den andra.
- Bakgrundsfärgen `"transparent"` bevaras endast med utdataformaten `png`, `webp` eller `avif`.
