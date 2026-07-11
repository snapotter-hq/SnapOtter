---
description: "Die Audiospur aus einem Video herausziehen."
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: b28c019d8900
---

# Extract Audio {#extract-audio}

Die Audiospur aus einer Videodatei extrahieren und als MP3, WAV, M4A oder OGG speichern.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Ausgabe-Audioformat: `mp3`, `wav`, `m4a`, `ogg` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Wenn das Video keine Audiospur hat, gibt die Anfrage einen 400-Fehler zurück.
- MP3 ist verlustbehaftet, aber weithin kompatibel. WAV ist verlustfrei, aber groß. M4A (AAC) bietet ein gutes Gleichgewicht zwischen Qualität und Größe. OGG ist für Workflows mit offenen Codecs verfügbar.
- Wenn die Quellaudiospur bereits AAC ist und das Ausgabeformat M4A lautet, wird der Audiostream ohne Neukodierung kopiert.
