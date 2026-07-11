---
description: "Ridimensiona un video a una nuova risoluzione o a una dimensione preimpostata."
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: bbbfed2729fb
---

# Resize Video {#resize-video}

Ridimensiona un video a una nuova risoluzione usando dimensioni in pixel personalizzate o un preset standard.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

Accetta dati form multipart con un file video e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Larghezza target in pixel (16-7680) |
| height | integer | No | - | Altezza target in pixel (16-4320) |
| preset | string | No | `"custom"` | Preset di risoluzione: `custom`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |

Quando `preset` è `"custom"`, deve essere fornito almeno uno tra `width` o `height`. L'altra dimensione scala in modo proporzionale.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

Ridimensiona a dimensioni personalizzate:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- I valori dei preset corrispondono ad altezze standard (ad es. `720p` = 1280x720, `1080p` = 1920x1080). La larghezza scala in modo proporzionale a partire dalle proporzioni della sorgente.
- Le dimensioni vengono arrotondate a numeri pari come richiesto dalla maggior parte dei codec video.
- La risoluzione massima supportata è 7680x4320 (8K UHD).
