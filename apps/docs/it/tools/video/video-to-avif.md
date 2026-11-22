---
description: "Converti una clip video in un'immagine AVIF animata."
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: 3ad73560d283
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

Converti una clip video in un'immagine AVIF animata con frequenza dei fotogrammi, larghezza, qualità e intervallo della clip configurabili.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

Accetta dati form multipart con un file video e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Frequenza dei fotogrammi di output (1-30) |
| width | integer | No | `480` | Larghezza di output in pixel (64-1280). L'altezza scala in modo proporzionale |
| startS | number | No | `0` | Punto di inizio della clip, in secondi |
| durationS | number | No | `5` | Durata della clip in secondi (fino a 60) |
| quality | integer | No | `50` | Qualità AVIF (1-100) |
| loop | boolean | No | `true` | Ripeti l'animazione in loop |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

La codifica AV1 è più lenta di GIF o WebP, quindi questo strumento di solito risponde `202` con un job da seguire via SSE su `/api/v1/jobs/{jobId}/progress`. Una clip breve può terminare entro la finestra sincrona e restituire direttamente il risultato:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- L'AVIF animato è privo di royalty e di solito più leggero di un WebP o GIF animato a parità di qualità visiva.
- I browser attuali riproducono l'AVIF animato. Alcuni visualizzatori di immagini desktop mostrano solo il primo fotogramma.
- La traccia audio viene rimossa.
