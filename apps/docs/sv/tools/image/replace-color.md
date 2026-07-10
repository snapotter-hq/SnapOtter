---
description: "Ersätt en specifik färg i en bild med en annan färg eller gör den transparent."
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: 05ea817de7e7
---

# Ersätt och invertera färg {#replace-invert-color}

Ersätt pixlar som matchar en källfärg med en målfärg, eller gör dem transparenta. Använder euklidiskt avstånd i RGB-rymden med konfigurerbar tolerans för mjuk övergång vid färggränser.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| sourceColor | string | Nej | `"#FF0000"` | Hex-färg att hitta (format: `#RRGGBB`) |
| targetColor | string | Nej | `"#00FF00"` | Hex-färg att ersätta med (format: `#RRGGBB`) |
| makeTransparent | boolean | Nej | `false` | Gör matchande pixlar transparenta istället för att ersätta med målfärgen |
| tolerance | number | Nej | `30` | Tolerans för färgmatchning (0 till 255). Högre värden matchar ett bredare intervall av liknande färger |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

Gör en grön bakgrund transparent:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Anteckningar {#notes}

- Färgmatchning använder euklidiskt avstånd i RGB-rymden, skalat med `tolerance * sqrt(3)`.
- Ersättningsövergången är proportionell mot färgavståndet: pixlar närmare källfärgen får mer av målfärgen, vilket skapar mjuka övergångar.
- När `makeTransparent` är `true` tvingas utdata till PNG (eller WebP/AVIF) om indataformatet inte stöder alfakanaler (t.ex. JPEG).
- En tolerans på 0 matchar endast den exakta källfärgen. Högre värden (50+) matchar ett bredare intervall av liknande nyanser.
- Utdataformatet matchar indataformatet om inte transparens behövs och indataformatet saknar stöd för alfa.
