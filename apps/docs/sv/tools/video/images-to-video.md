---
description: "Gör en uppsättning bilder till en bildspelsvideo, en animerad GIF eller en animerad WebP."
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: 462f372b16c8
i18n_hash_version: 2
---

# Bilder till video {#images-to-video}

Gör en uppsättning bilder till en bildspelsvideo med konfigurerbar visningstid per bild, upplösning och bildhastighet, eller till en animerad GIF eller WebP med fast tid per bildruta och antal loopar.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Tar emot multipart-formulärdata med två eller fler bildfiler och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| outputFormat | string | Nej | `"mp4"` | Utdataformat: `mp4`, `gif`, `webp` |
| secondsPerImage | number | Nej | `2` | Endast MP4. Visningstid per bild i sekunder (0.5-10) |
| resolution | string | Nej | `"720p"` | Endast MP4. Utdataupplösning: `1080p`, `720p`, `square` |
| fps | integer | Nej | `30` | Endast MP4. Utdatabildhastighet (10-60) |
| frameDelayMs | integer | Nej | `500` | Endast GIF och WebP. Tid som varje bild visas, i millisekunder (20-10000) |
| loop | integer | Nej | `0` | Endast GIF och WebP. Hur många gånger animationen spelas; `0` loopar för alltid (0-100) |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

Så här bygger du en animerad GIF där varje bild visas i 200 ms:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Anteckningar {#notes}

- Tar emot 2-60 bildfiler per begäran. Bilderna visas i videon i uppladdningsordning.
- För MP4 storleksändras och fylls bilderna ut för att passa målupplösningen samtidigt som bildförhållandet bevaras.
- Upplösningsalternativet `square` ger en video på 1080x1080, användbart för sociala medier.
- MP4-utdata är H.264 och heter `slideshow.mp4`.
- GIF- och WebP-utdata använder den första bildens storlek. Bilder med andra storlekar skalas så att de ryms inuti den, och den återstående ytan är transparent. Filen heter `slideshow.gif` eller `slideshow.webp`.
- GIF lagrar bildrutetider i hundradelar av en sekund, så `frameDelayMs` avrundas till närmaste 10 ms i en GIF. WebP behåller det exakta värdet.
- Stora animationer vägras i stället för att byggas: bildrutans storlek gånger antalet bilder måste hålla sig under samma pixelgräns som GIF-verktygen använder.
