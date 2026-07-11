---
description: "Een videoclip omzetten naar een geanimeerde WebP-afbeelding."
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: 26192e63e067
---

# Video to WebP {#video-to-webp}

Zet een videoclip om naar een geanimeerde WebP-afbeelding met een instelbare framerate, breedte en kwaliteit.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| fps | integer | Nee | `12` | Uitvoerframerate (1-30) |
| width | integer | Nee | `480` | Uitvoerbreedte in pixels (16-1920). De hoogte schaalt proportioneel mee |
| quality | integer | Nee | `75` | WebP-compressiekwaliteit (1-100) |
| loop | boolean | Nee | `true` | De animatie laten herhalen |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Geanimeerde WebP produceert kleinere bestanden dan GIF met betere kleurondersteuning (24-bit versus 8-bit palet).
- Lagere waarden voor `quality` produceren kleinere bestanden ten koste van de visuele getrouwheid.
- Zet `loop` op `false` voor animaties die één keer moeten afspelen en dan stoppen.
