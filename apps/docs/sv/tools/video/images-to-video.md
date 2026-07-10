---
description: "Gör en uppsättning bilder till en bildspelsvideo."
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: b3230a3196e4
---

# Bilder till video {#images-to-video}

Gör en uppsättning bilder till en bildspelsvideo med konfigurerbar visningstid per bild, upplösning och bildhastighet.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Tar emot multipart-formulärdata med två eller fler bildfiler och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | Nej | `2` | Visningstid per bild i sekunder (0.5-10) |
| resolution | string | Nej | `"720p"` | Utdataupplösning: `1080p`, `720p`, `square` |
| fps | integer | Nej | `30` | Utdatabildhastighet (10-60) |

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
- Bilder storleksändras och fylls ut för att passa målupplösningen samtidigt som bildförhållandet bevaras.
- Upplösningsalternativet `square` ger en video på 1080x1080, användbart för sociala medier.
- Utdataformatet är alltid MP4 (H.264).
