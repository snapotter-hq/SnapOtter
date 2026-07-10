---
description: "Sustituye la pista de audio de un vídeo por otro archivo."
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: 0f94839041bf
---

# Replace Audio {#replace-audio}

Sustituye la pista de audio de un vídeo por un archivo de audio. Sube tanto un vídeo como un archivo de audio.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

Acepta datos de formulario multipart con exactamente dos archivos: un archivo de vídeo seguido de un archivo de audio.

## Parameters {#parameters}

Esta herramienta no tiene parámetros de configuración. Sube un archivo de vídeo y un archivo de audio como dos partes `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- Deben subirse exactamente dos archivos: el primero debe ser un vídeo y el segundo un archivo de audio.
- Si el archivo de audio es más largo que el vídeo, se recorta para ajustarse a la duración del vídeo. Si es más corto, el vídeo restante se reproduce en silencio.
- El flujo de vídeo se copia sin recodificar, por lo que no hay pérdida de calidad de vídeo.
