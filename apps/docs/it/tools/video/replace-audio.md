---
description: "Sostituisci la traccia audio di un video con un altro file."
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: 7a81a3b53194
---

# Replace Audio {#replace-audio}

Sostituisci la traccia audio di un video con un file audio. Carica sia un video sia un file audio.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

Accetta dati form multipart con esattamente due file: un file video seguito da un file audio.

## Parameters {#parameters}

Questo strumento non ha parametri di impostazione. Carica un file video e un file audio come due parti `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- Devono essere caricati esattamente due file: il primo deve essere un video, il secondo deve essere un file audio.
- Se il file audio è più lungo del video, viene tagliato per corrispondere alla durata del video. Se è più corto, il video restante viene riprodotto in silenzio.
- Il flusso video viene copiato senza ricodifica, quindi non c'è perdita di qualità video.
