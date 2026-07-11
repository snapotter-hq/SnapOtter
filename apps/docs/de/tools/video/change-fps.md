---
description: "Die Bildrate eines Videos ändern."
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: 88be64f5cda9
---

# Change FPS {#change-fps}

Die Bildrate eines Videos auf einen Zielwert zwischen 1 und 120 fps ändern.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | Ziel-Bildrate (1-120) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- Das Senken der Bildrate lässt Frames weg und verringert die Dateigröße. Das Erhöhen dupliziert Frames, um die Lücke zu füllen, fügt aber keine echten Bewegungsdetails hinzu.
- Gängige Zielwerte: 24 (Kino), 30 (Web/Broadcast), 60 (flüssige Wiedergabe).
- Die Audiospur wird mit ihrer ursprünglichen Abtastrate beibehalten.
