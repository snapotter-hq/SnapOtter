---
description: "Normaliza el volumen de audio del vídeo al estándar de emisión."
i18n_source_hash: 078f1e819c9a
i18n_provenance: human
i18n_output_hash: 17d9fefa34bc
---

# Normalize Audio {#normalize-audio}

Normaliza el volumen de audio del vídeo al estándar de sonoridad de emisión EBU R128.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

Acepta datos de formulario multipart con un archivo de vídeo. Esta herramienta no tiene ajustes configurables.

## Parameters {#parameters}

Esta herramienta no tiene parámetros. Aplica la normalización de sonoridad EBU R128 a la pista de audio.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- Usa el filtro `loudnorm` de FFmpeg dirigido a una sonoridad integrada de -16 LUFS con un pico verdadero de -1.5 dBTP y un rango de sonoridad de 11 LU (estándar de emisión EBU R128).
- La frecuencia de muestreo del audio de origen se conserva en la salida.
- Si el vídeo no tiene pista de audio, la petición devuelve un error 400.
