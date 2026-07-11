---
description: "Einen Videoclip rückwärts abspielen."
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: b787a0c53f93
---

# Reverse Video {#reverse-video}

Einen Videoclip rückwärts abspielen. Die Audiospur wird ebenfalls umgekehrt.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

Nimmt Multipart-Formulardaten mit einer Videodatei entgegen. Dieses Tool hat keine konfigurierbaren Einstellungen.

## Parameters {#parameters}

Dieses Tool hat keine Parameter. Es kehrt das gesamte Video um.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes {#notes}

- Begrenzt auf Clips mit einer Länge von bis zu 5 Minuten. Längere Videos werden mit einem 400-Fehler abgelehnt.
- Sowohl die Video- als auch die Audiospur werden umgekehrt. Um das Video ohne Ton umzukehren, stellen Sie es zuerst stumm.
