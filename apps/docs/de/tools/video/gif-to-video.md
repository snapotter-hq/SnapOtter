---
description: "Ein animiertes GIF in ein MP4-, WebM- oder MOV-Video konvertieren."
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: fa3b89f36e19
---

# GIF to Video {#gif-to-video}

Ein animiertes GIF in eine kompakte MP4-, WebM- oder MOV-Videodatei konvertieren.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

Nimmt Multipart-Formulardaten mit einer GIF-Datei und einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Ausgabeformat: `mp4`, `webm`, `mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- Die Konvertierung von GIF zu Video verringert die Dateigröße typischerweise um 80-90 %, während dieselbe visuelle Qualität erhalten bleibt.
- Es werden nur animierte GIF-Dateien akzeptiert. Für statische Bilder sollte das Bild-Tool Convert verwendet werden.
- MP4 und MOV verwenden H.264-Kodierung, WebM verwendet VP9.
