---
description: "Cambia la velocidad de fotogramas de un vídeo."
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: 6f43f6bea2ab
---

# Change FPS {#change-fps}

Cambia la velocidad de fotogramas de un vídeo a un valor objetivo entre 1 y 120 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | Velocidad de fotogramas objetivo (1-120) |

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

- Reducir la velocidad de fotogramas descarta fotogramas y reduce el tamaño del archivo. Aumentarla duplica fotogramas para rellenar el hueco, pero no añade detalle real de movimiento.
- Valores objetivo comunes: 24 (cine), 30 (web/emisión), 60 (reproducción fluida).
- La pista de audio se conserva a su frecuencia de muestreo original.
