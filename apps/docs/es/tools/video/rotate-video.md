---
description: "Rota o voltea un vídeo."
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: 3cfde0f904f6
---

# Rotate Video {#rotate-video}

Rota un vídeo 90, 180 o 270 grados, o voltéalo horizontal o verticalmente.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | Transformación a aplicar: `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transform Values {#transform-values}

- **cw90** - Rotar 90 grados en sentido horario
- **ccw90** - Rotar 90 grados en sentido antihorario
- **180** - Rotar 180 grados
- **hflip** - Voltear horizontalmente (espejo)
- **vflip** - Voltear verticalmente

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

- Las rotaciones de 90 o 270 grados intercambian el ancho y el alto del vídeo.
- Las operaciones de volteo (hflip, vflip) no cambian las dimensiones del vídeo.
