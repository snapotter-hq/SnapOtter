---
description: "Ruota o capovolgi un video."
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: 7e5fbc5476bb
---

# Rotate Video {#rotate-video}

Ruota un video di 90, 180 o 270 gradi, oppure capovolgilo orizzontalmente o verticalmente.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

Accetta dati form multipart con un file video e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | Trasformazione da applicare: `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transform Values {#transform-values}

- **cw90** - Ruota di 90 gradi in senso orario
- **ccw90** - Ruota di 90 gradi in senso antiorario
- **180** - Ruota di 180 gradi
- **hflip** - Capovolgi orizzontalmente (specchio)
- **vflip** - Capovolgi verticalmente

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/rotate-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"transform": "cw90"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- Le rotazioni di 90 o 270 gradi scambiano la larghezza e l'altezza del video.
- Le operazioni di capovolgimento (hflip, vflip) non modificano le dimensioni del video.
