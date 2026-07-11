---
description: "Helligkeit, Kontrast, Sättigung und Gamma eines Videos anpassen."
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: 4e97fb1510e0
---

# Video Color {#video-color}

Helligkeit, Kontrast, Sättigung und Gammakorrektur eines Videos anpassen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | Helligkeitsanpassung (-1 bis 1) |
| contrast | number | No | `1` | Kontrastmultiplikator (0-4) |
| saturation | number | No | `1` | Sättigungsmultiplikator (0-3). Auf 0 setzen für Graustufen |
| gamma | number | No | `1` | Gammakorrektur (0.1-10) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- Alle Werte auf ihren Standardwerten (Helligkeit 0, Kontrast 1, Sättigung 1, Gamma 1) bewirken keine Änderung.
- Wenn die Sättigung auf `0` gesetzt wird, wird das Video in Graustufen umgewandelt.
- Gammawerte unter 1 hellen Schatten auf, während Werte über 1 sie abdunkeln.
