---
description: "Konvertera ett videoklipp till en animerad AVIF-bild."
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: 95bf8994f89c
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

Konvertera ett videoklipp till en animerad AVIF-bild med konfigurerbar bildhastighet, bredd, kvalitet och klippintervall.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | Nej | `12` | Utdatabildhastighet (1-30) |
| width | integer | Nej | `480` | Utdatabredd i pixlar (64-1280). Höjden skalas proportionellt |
| startS | number | Nej | `0` | Var klippet börjar, i sekunder |
| durationS | number | Nej | `5` | Klippets längd i sekunder (upp till 60) |
| quality | integer | Nej | `50` | AVIF-kvalitet (1-100) |
| loop | boolean | Nej | `true` | Loopa animationen |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

AV1-kodning är långsammare än GIF eller WebP, så verktyget svarar oftast `202` med ett jobb som du följer via SSE på `/api/v1/jobs/{jobId}/progress`. Ett kort klipp kan bli klart inom det synkrona fönstret och returnera resultatet direkt:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- Animerad AVIF är royaltyfri och oftast mindre än en animerad WebP eller GIF vid samma visuella kvalitet.
- Aktuella webbläsare spelar upp animerad AVIF. Vissa bildvisare för datorn visar bara den första bildrutan.
- Ljudspåret tas bort.
