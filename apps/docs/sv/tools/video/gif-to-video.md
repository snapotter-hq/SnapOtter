---
description: "Konvertera en animerad GIF till en MP4-, WebM- eller MOV-video."
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: af290662a4c7
---

# GIF till video {#gif-to-video}

Konvertera en animerad GIF till en kompakt MP4-, WebM- eller MOV-videofil.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

Tar emot multipart-formulärdata med en GIF-fil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| format | string | Nej | `"mp4"` | Utdataformat: `mp4`, `webm`, `mov` |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Anteckningar {#notes}

- Att konvertera GIF till video minskar vanligtvis filstorleken med 80-90 % samtidigt som samma visuella kvalitet bibehålls.
- Endast animerade GIF-filer accepteras. Statiska bilder bör använda bildverktyget Konvertera.
- MP4 och MOV använder H.264-kodning, WebM använder VP9.
