---
description: "Video-Audiolautstärke auf den Broadcast-Standard normalisieren."
i18n_source_hash: c7a53b5faf1b
i18n_provenance: human
i18n_output_hash: e019971d4c7a
---

# Videoaudio normalisieren {#normalize-audio}

Video-Audiolautstärke auf den EBU-R128-Broadcast-Lautheitsstandard normalisieren.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

Nimmt Multipart-Formulardaten mit einer Videodatei entgegen. Dieses Tool hat keine konfigurierbaren Einstellungen.

## Parameters {#parameters}

Dieses Tool hat keine Parameter. Es wendet die EBU-R128-Lautheitsnormalisierung auf die Audiospur an.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- Verwendet den `loudnorm`-Filter von FFmpeg, der auf -16 LUFS integrierte Lautheit mit -1.5 dBTP True Peak und 11 LU Lautheitsbereich abzielt (EBU-R128-Broadcast-Standard).
- Die Abtastrate des Quellaudios wird in der Ausgabe beibehalten.
- Wenn das Video keine Audiospur hat, gibt die Anfrage einen 400-Fehler zurück.
