---
description: "Die Audiospur aus einem Video entfernen."
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: fecf07ecb196
---

# Mute Video {#mute-video}

Die Audiospur aus einem Video entfernen, sodass nur der visuelle Stream übrig bleibt.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

Nimmt Multipart-Formulardaten mit einer Videodatei entgegen. Dieses Tool hat keine konfigurierbaren Einstellungen.

## Parameters {#parameters}

Dieses Tool hat keine Parameter. Es entfernt die Audiospur aus dem hochgeladenen Video.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- Der Videostream wird ohne Neukodierung kopiert, sodass kein Qualitätsverlust auftritt.
- Wenn das Eingabevideo keine Audiospur hat, wird die Datei unverändert zurückgegeben.
