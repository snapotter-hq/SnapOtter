---
description: "Rimuovi i metadati da un video e riporta cosa è stato trovato."
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: 6db7258b74b7
---

# Clean Video Metadata {#clean-video-metadata}

Rimuovi i metadati (data di creazione, coordinate GPS, modello della camera, tag software, ecc.) da un video e riporta cosa è stato rimosso.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

Accetta dati form multipart con un file video. Questo strumento non ha impostazioni configurabili.

## Parameters {#parameters}

Questo strumento non ha parametri. Rimuove tutti i metadati dal contenitore video.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip_clean.mp4",
  "originalSize": 12500000,
  "processedSize": 12480000,
  "metadata": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "durationS": 42.5,
    "bitrateKbps": 2350,
    "streams": [
      { "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
      { "type": "audio", "codec": "aac", "sampleRate": 48000 }
    ]
  }
}
```

## Notes {#notes}

- I metadati rimossi includono i timestamp di creazione, i dati GPS/di posizione, le informazioni sulla camera/dispositivo e i tag software.
- I flussi video e audio vengono copiati senza ricodifica, quindi non c'è perdita di qualità.
- Utile per la privacy prima di condividere pubblicamente i video.
