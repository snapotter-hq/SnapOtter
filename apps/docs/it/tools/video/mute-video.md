---
description: "Rimuovi la traccia audio da un video."
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: 6f907408af86
---

# Mute Video {#mute-video}

Rimuovi la traccia audio da un video, lasciando solo il flusso visivo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

Accetta dati form multipart con un file video. Questo strumento non ha impostazioni configurabili.

## Parameters {#parameters}

Questo strumento non ha parametri. Rimuove la traccia audio dal video caricato.

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

- Il flusso video viene copiato senza ricodifica, quindi non c'è perdita di qualità.
- Se il video di input non ha una traccia audio, il file viene restituito invariato.
