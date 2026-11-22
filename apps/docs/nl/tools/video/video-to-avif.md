---
description: "Een videoclip omzetten naar een geanimeerde AVIF-afbeelding."
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: 3247d5f410d2
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

Een videoclip omzetten naar een geanimeerde AVIF-afbeelding met instelbare framerate, breedte, kwaliteit en clipbereik.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | Nee | `12` | Uitvoerframerate (1-30) |
| width | integer | Nee | `480` | Uitvoerbreedte in pixels (64-1280). De hoogte schaalt proportioneel mee |
| startS | number | Nee | `0` | Waar de clip begint, in seconden |
| durationS | number | Nee | `5` | Cliplengte in seconden (maximaal 60) |
| quality | integer | Nee | `50` | AVIF-kwaliteit (1-100) |
| loop | boolean | Nee | `true` | De animatie laten herhalen |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

AV1-codering is trager dan GIF of WebP, dus deze tool antwoordt meestal met `202` en een job die je via SSE volgt op `/api/v1/jobs/{jobId}/progress`. Een korte clip kan binnen het synchrone venster klaar zijn en het resultaat direct teruggeven:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- Geanimeerde AVIF is royaltyvrij en meestal kleiner dan een geanimeerde WebP of GIF bij dezelfde visuele kwaliteit.
- Huidige browsers spelen geanimeerde AVIF af. Sommige desktopafbeeldingsviewers tonen alleen het eerste frame.
- Het audiospoor wordt verwijderd.
