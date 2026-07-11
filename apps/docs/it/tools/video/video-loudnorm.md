---
description: "Normalizza il volume audio del video allo standard broadcast."
i18n_source_hash: 078f1e819c9a
i18n_provenance: human
i18n_output_hash: abb116be018e
---

# Normalize Audio {#normalize-audio}

Normalizza il volume audio del video allo standard di loudness broadcast EBU R128.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

Accetta dati form multipart con un file video. Questo strumento non ha impostazioni configurabili.

## Parameters {#parameters}

Questo strumento non ha parametri. Applica la normalizzazione di loudness EBU R128 alla traccia audio.

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

- Usa il filtro `loudnorm` di FFmpeg puntando a -16 LUFS di loudness integrata con true peak di -1.5 dBTP e un intervallo di loudness di 11 LU (standard broadcast EBU R128).
- La frequenza di campionamento dell'audio sorgente viene conservata nell'output.
- Se il video non ha una traccia audio, la richiesta restituisce un errore 400.
