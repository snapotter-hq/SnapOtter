---
description: "Einen Videoclip in ein animiertes AVIF-Bild konvertieren."
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: 4bdea448ea08
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

Einen Videoclip in ein animiertes AVIF-Bild mit konfigurierbarer Bildrate, Breite, Qualität und Clipbereich konvertieren.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Ausgabe-Bildrate (1-30) |
| width | integer | No | `480` | Ausgabebreite in Pixeln (64-1280). Die Höhe skaliert proportional |
| startS | number | No | `0` | Startpunkt des Clips in Sekunden |
| durationS | number | No | `5` | Cliplänge in Sekunden (bis zu 60) |
| quality | integer | No | `50` | AVIF-Qualität (1-100) |
| loop | boolean | No | `true` | Die Animation in Schleife abspielen |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

AV1-Kodierung ist langsamer als GIF oder WebP, daher antwortet dieses Tool meist mit `202` und einem Job, dessen Fortschritt Sie per SSE unter `/api/v1/jobs/{jobId}/progress` verfolgen. Ein kurzer Clip kann innerhalb des Sync-Fensters fertig werden und das Ergebnis direkt zurückgeben:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- Animiertes AVIF ist lizenzgebührenfrei und bei gleicher visueller Qualität meist kleiner als ein animiertes WebP oder GIF.
- Aktuelle Browser spielen animiertes AVIF ab. Manche Desktop-Bildbetrachter zeigen nur das erste Bild.
- Die Tonspur wird entfernt.
