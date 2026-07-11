---
description: "Converti una clip video in un'immagine WebP animata."
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: 3e82deedb790
---

# Video to WebP {#video-to-webp}

Converti una clip video in un'immagine WebP animata con frequenza dei fotogrammi, larghezza e qualità configurabili.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

Accetta dati form multipart con un file video e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Frequenza dei fotogrammi di output (1-30) |
| width | integer | No | `480` | Larghezza di output in pixel (16-1920). L'altezza scala in modo proporzionale |
| quality | integer | No | `75` | Qualità di compressione WebP (1-100) |
| loop | boolean | No | `true` | Ripeti l'animazione in loop |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Il WebP animato produce file più piccoli rispetto alla GIF con un supporto colore migliore (24 bit contro palette a 8 bit).
- Valori più bassi di `quality` producono file più piccoli a scapito della fedeltà visiva.
- Imposta `loop` su `false` per le animazioni che dovrebbero riprodursi una volta e fermarsi.
