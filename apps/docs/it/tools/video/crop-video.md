---
description: "Ritaglia una regione da un video."
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: 5f2716232df2
---

# Crop Video {#crop-video}

Ritaglia una regione rettangolare da un video specificando la dimensione e la posizione della regione.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

Accetta dati form multipart con un file video e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Yes | - | Larghezza della regione di ritaglio in pixel (minimo 16) |
| height | integer | Yes | - | Altezza della regione di ritaglio in pixel (minimo 16) |
| x | integer | No | `0` | Offset orizzontale dall'angolo in alto a sinistra |
| y | integer | No | `0` | Offset verticale dall'angolo in alto a sinistra |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Notes {#notes}

- La regione di ritaglio deve rientrare nelle dimensioni del video. Se `x + width` o `y + height` supera la dimensione della sorgente, la richiesta restituisce un errore 400.
- La dimensione minima di ritaglio è 16x16 pixel.
- Le dimensioni vengono arrotondate a numeri pari come richiesto dalla maggior parte dei codec video.
