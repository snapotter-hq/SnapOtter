---
description: "Riproduci una clip video al contrario."
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: 14f968a69a3d
---

# Reverse Video {#reverse-video}

Riproduci una clip video al contrario. Anche la traccia audio viene invertita.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

Accetta dati form multipart con un file video. Questo strumento non ha impostazioni configurabili.

## Parameters {#parameters}

Questo strumento non ha parametri. Inverte l'intero video.

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

- Limitato a clip di durata massima di 5 minuti. I video più lunghi vengono rifiutati con un errore 400.
- Sia la traccia video sia quella audio vengono invertite. Per invertire il video senza audio, disattiva prima l'audio.
