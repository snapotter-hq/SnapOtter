---
description: "Frames aus einem Video als ZIP mit Bildern extrahieren."
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: fcb97abe8b99
---

# Video to Frames {#video-to-frames}

Einzelne Frames aus einem Video extrahieren und als ZIP-Archiv mit PNG- oder JPG-Bildern herunterladen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | Extraktionsmodus: `all`, `nth`, `timestamps` |
| n | integer | No | `10` | Jeden N-ten Frame extrahieren (2-1000). Wird nur verwendet, wenn der Modus `"nth"` ist |
| timestamps | string | No | `""` | Kommagetrennte Zeitstempel in Sekunden. Erforderlich, wenn der Modus `"timestamps"` ist |
| format | string | No | `"png"` | Bildformat für extrahierte Frames: `png`, `jpg` |

## Example Request {#example-request}

Jeden 30. Frame als JPG extrahieren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

Frames zu bestimmten Zeitstempeln extrahieren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- Der Modus `all` extrahiert jeden Frame und kann bei langen Videos sehr große ZIP-Dateien erzeugen. Verwenden Sie den Modus `nth` oder `timestamps` für eine selektive Extraktion.
- PNG bewahrt die volle Qualität, erzeugt aber größere Dateien. JPG ist kleiner, aber verlustbehaftet.
- Die Antwort wird als ZIP-Archiv heruntergeladen, das fortlaufend nummerierte Bilddateien enthält.
