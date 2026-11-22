---
description: "Die Untertitelspur als SRT-, WebVTT- oder ASS-Datei aus einem Video herausziehen."
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: f28bd37680d3
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

Die eingebettete Untertitelspur aus einem Videocontainer extrahieren und als SRT-, WebVTT- oder ASS-Datei herunterladen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Nimmt Multipart-Formulardaten mit einer Videodatei und einer optionalen `settings`-JSON-Zeichenkette entgegen.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | Ausgabeformat: `srt`, `vtt` (WebVTT) oder `ass` |

Extrahiert wird die erste im Videocontainer gefundene Untertitelspur.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- Das Video muss eine eingebettete Untertitelspur enthalten. Wenn keine Untertitelspur gefunden wird, gibt die Anfrage einen 400-Fehler zurück.
- Wenn das Video mehrere Untertitelspuren hat, wird die erste extrahiert.
- Textspuren (SubRip, ASS, mov_text, WebVTT) lassen sich in jedes der drei Ausgabeformate umwandeln. Beim Umwandeln einer ASS-Spur in SRT oder WebVTT gehen Positionierung und Effekte verloren.
- Bildbasierte Spuren (Blu-ray PGS, DVD VobSub) lassen sich ohne OCR nicht in Text umwandeln und liefern einen 422-Fehler.
