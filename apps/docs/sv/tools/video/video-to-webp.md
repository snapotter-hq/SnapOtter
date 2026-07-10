---
description: "Konvertera ett videoklipp till en animerad WebP-bild."
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: f8fdfe79ddeb
---

# Video till WebP {#video-to-webp}

Konvertera ett videoklipp till en animerad WebP-bild med konfigurerbar bildhastighet, bredd och kvalitet.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| fps | integer | Nej | `12` | Utdatabildhastighet (1-30) |
| width | integer | Nej | `480` | Utdatabredd i pixlar (16-1920). Höjden skalas proportionellt |
| quality | integer | Nej | `75` | WebP-komprimeringskvalitet (1-100) |
| loop | boolean | Nej | `true` | Loopa animationen |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Anteckningar {#notes}

- Animerad WebP producerar mindre filer än GIF med bättre färgstöd (24-bitars mot 8-bitars palett).
- Lägre värden på `quality` producerar mindre filer på bekostnad av visuell trohet.
- Sätt `loop` till `false` för animationer som ska spelas upp en gång och sedan stanna.
