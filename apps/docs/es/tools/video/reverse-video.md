---
description: "Reproduce un clip de vídeo al revés."
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: c603b574e120
---

# Reverse Video {#reverse-video}

Reproduce un clip de vídeo al revés. La pista de audio también se invierte.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

Acepta datos de formulario multipart con un archivo de vídeo. Esta herramienta no tiene ajustes configurables.

## Parameters {#parameters}

Esta herramienta no tiene parámetros. Invierte el vídeo completo.

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

- Limitado a clips de hasta 5 minutos de duración. Los vídeos más largos se rechazan con un error 400.
- Se invierten tanto la pista de vídeo como la de audio. Para invertir el vídeo sin audio, siléncialo primero.
