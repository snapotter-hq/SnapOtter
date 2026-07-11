---
description: "Cambia la frequenza dei fotogrammi di un video."
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: 45a130d6b827
---

# Change FPS {#change-fps}

Cambia la frequenza dei fotogrammi di un video su un valore target compreso tra 1 e 120 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

Accetta dati form multipart con un file video e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | Frequenza dei fotogrammi target (1-120) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- Abbassare la frequenza dei fotogrammi elimina fotogrammi e riduce la dimensione del file. Aumentarla duplica i fotogrammi per riempire il vuoto ma non aggiunge un reale dettaglio di movimento.
- Valori target comuni: 24 (cinema), 30 (web/broadcast), 60 (riproduzione fluida).
- La traccia audio viene conservata alla sua frequenza di campionamento originale.
