---
description: "Eine Reihe von Bildern in ein Diashow-Video, ein animiertes GIF oder ein animiertes WebP verwandeln."
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: 0cf641ec86be
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

Eine Reihe von Bildern in ein Diashow-Video mit konfigurierbarer Anzeigedauer pro Bild, Auflösung und Bildrate verwandeln, oder in ein animiertes GIF oder WebP mit fester Zeit pro Frame und Anzahl der Wiederholungen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Nimmt Multipart-Formulardaten mit zwei oder mehr Bilddateien und einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | Ausgabeformat: `mp4`, `gif`, `webp` |
| secondsPerImage | number | No | `2` | Nur MP4. Anzeigedauer pro Bild in Sekunden (0.5-10) |
| resolution | string | No | `"720p"` | Nur MP4. Ausgabeauflösung: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Nur MP4. Ausgabe-Bildrate (10-60) |
| frameDelayMs | integer | No | `500` | Nur GIF und WebP. Zeit, die jedes Bild angezeigt wird, in Millisekunden (20-10000) |
| loop | integer | No | `0` | Nur GIF und WebP. Wie oft die Animation abgespielt wird; `0` wiederholt endlos (0-100) |

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

So erstellst du ein animiertes GIF, das jedes Bild 200 ms lang zeigt:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
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
- Bei MP4 werden Bilder skaliert und aufgefüllt, um in die Zielauflösung zu passen, wobei das Seitenverhältnis erhalten bleibt.
- Die Auflösungsoption `square` erzeugt ein 1080x1080-Video, das für soziale Medien nützlich ist.
- Die MP4-Ausgabe ist H.264 und heißt `slideshow.mp4`.
- Die GIF- und WebP-Ausgabe verwendet die Größe des ersten Bildes. Bilder anderer Größe werden so skaliert, dass sie hineinpassen, und der übrige Bereich ist transparent. Die Datei heißt `slideshow.gif` oder `slideshow.webp`.
- GIF speichert Frame-Zeiten in Hundertstelsekunden, daher wird `frameDelayMs` in einem GIF auf die nächsten 10 ms gerundet. WebP behält den exakten Wert bei.
- Große Animationen werden abgelehnt statt erstellt: Die Frame-Größe mal die Anzahl der Bilder muss unter demselben Pixellimit bleiben, das auch die GIF-Tools verwenden.
