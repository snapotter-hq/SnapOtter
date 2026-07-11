---
description: "Eine Reihe von Bildern in ein Diashow-Video verwandeln."
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: 63bf82273377
---

# Images to Video {#images-to-video}

Eine Reihe von Bildern in ein Diashow-Video mit konfigurierbarer Anzeigedauer pro Bild, Auflösung und Bildrate verwandeln.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Nimmt Multipart-Formulardaten mit zwei oder mehr Bilddateien und einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | Anzeigedauer pro Bild in Sekunden (0.5-10) |
| resolution | string | No | `"720p"` | Ausgabeauflösung: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Ausgabe-Bildrate (10-60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- Akzeptiert 2-60 Bilddateien pro Anfrage. Die Bilder erscheinen im Video in der Reihenfolge des Uploads.
- Bilder werden skaliert und aufgefüllt, um in die Zielauflösung zu passen, wobei das Seitenverhältnis erhalten bleibt.
- Die Auflösungsoption `square` erzeugt ein 1080x1080-Video, das für soziale Medien nützlich ist.
- Das Ausgabeformat ist immer MP4 (H.264).
