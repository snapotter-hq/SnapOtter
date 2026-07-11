---
description: "Einen Videoclip in ein animiertes WebP-Bild konvertieren."
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: 650faf06b8aa
---

# Video to WebP {#video-to-webp}

Einen Videoclip in ein animiertes WebP-Bild mit konfigurierbarer Bildrate, Breite und Qualität konvertieren.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Ausgabe-Bildrate (1-30) |
| width | integer | No | `480` | Ausgabebreite in Pixeln (16-1920). Die Höhe skaliert proportional |
| quality | integer | No | `75` | WebP-Kompressionsqualität (1-100) |
| loop | boolean | No | `true` | Die Animation in Schleife abspielen |

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

- Animiertes WebP erzeugt kleinere Dateien als GIF mit besserer Farbunterstützung (24 Bit gegenüber 8-Bit-Palette).
- Niedrigere Werte für `quality` erzeugen kleinere Dateien auf Kosten der visuellen Wiedergabetreue.
- Setzen Sie `loop` auf `false` für Animationen, die einmal abgespielt werden und dann stoppen sollen.
