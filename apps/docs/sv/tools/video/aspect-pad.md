---
description: "Lägg till enfärgade fält för att passa ett målformat."
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: ef782639c63a
---

# Aspect Pad {#aspect-pad}

Lägg till enfärgade letterbox- eller pillarbox-fält för att få en video att passa in i ett målbildförhållande utan att beskära.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| target | string | Nej | `"9:16"` | Målbildförhållande: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | Nej | `"#000000"` | Hex-färg för utfyllnadsfälten (t.ex. `"#000000"` för svart) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- Om videon redan matchar målbildförhållandet returneras filen oförändrad.
- Använd `9:16` för vertikala/porträttformat för sociala medier (TikTok, Reels, Shorts).
- För suddig utfyllnad istället för enfärgad, använd verktyget Blur Pad.
