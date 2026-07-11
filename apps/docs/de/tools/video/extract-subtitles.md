---
description: "Die Untertitelspur als SRT-Datei aus einem Video herausziehen."
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: 36b98926e9e1
---

# Extract Subtitles {#extract-subtitles}

Die eingebettete Untertitelspur aus einem Videocontainer extrahieren und als SRT-Datei herunterladen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Nimmt Multipart-Formulardaten mit einer Videodatei entgegen. Dieses Tool hat keine konfigurierbaren Einstellungen.

## Parameters {#parameters}

Dieses Tool hat keine Parameter. Es extrahiert die erste im Videocontainer gefundene Untertitelspur.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- Das Video muss eine eingebettete Untertitelspur enthalten. Wenn keine Untertitelspur gefunden wird, gibt die Anfrage einen 400-Fehler zurück.
- Wenn das Video mehrere Untertitelspuren hat, wird die erste extrahiert.
- Das Ausgabeformat ist SRT, unabhängig vom ursprünglichen Untertitelformat im Container.
