---
description: "Estrai la traccia audio da un video."
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: 8741ea7d4d98
---

# Extract Audio {#extract-audio}

Estrai la traccia audio da un file video e salvala come MP3, WAV, M4A o OGG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

Accetta dati form multipart con un file video e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Formato audio di output: `mp3`, `wav`, `m4a`, `ogg` |

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

- Se il video non ha una traccia audio, la richiesta restituisce un errore 400.
- MP3 è con perdita ma ampiamente compatibile. WAV è senza perdita ma di grandi dimensioni. M4A (AAC) offre un buon equilibrio tra qualità e dimensione. OGG è disponibile per flussi di lavoro con codec aperti.
- Quando l'audio sorgente è già AAC e il formato di output è M4A, il flusso audio viene copiato senza ricodifica.
