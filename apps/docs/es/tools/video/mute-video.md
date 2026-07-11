---
description: "Elimina la pista de audio de un vídeo."
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: e52e6a0e7fa1
---

# Mute Video {#mute-video}

Elimina la pista de audio de un vídeo, dejando solo el flujo visual.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

Acepta datos de formulario multipart con un archivo de vídeo. Esta herramienta no tiene ajustes configurables.

## Parameters {#parameters}

Esta herramienta no tiene parámetros. Elimina la pista de audio del vídeo subido.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- El flujo de vídeo se copia sin recodificar, por lo que no hay pérdida de calidad.
- Si el vídeo de entrada no tiene pista de audio, el archivo se devuelve sin cambios.
