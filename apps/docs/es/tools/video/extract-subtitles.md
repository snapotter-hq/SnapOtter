---
description: "Extrae la pista de subtítulos de un vídeo como un archivo SRT."
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: 53eb1c364d6e
---

# Extract Subtitles {#extract-subtitles}

Extrae la pista de subtítulos incrustada de un contenedor de vídeo y la descarga como un archivo SRT.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Acepta datos de formulario multipart con un archivo de vídeo. Esta herramienta no tiene ajustes configurables.

## Parameters {#parameters}

Esta herramienta no tiene parámetros. Extrae la primera pista de subtítulos que encuentra en el contenedor de vídeo.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- El vídeo debe contener una pista de subtítulos incrustada. Si no se encuentra ninguna pista de subtítulos, la petición devuelve un error 400.
- Si el vídeo tiene varias pistas de subtítulos, se extrae la primera.
- El formato de salida es SRT independientemente del formato de subtítulos original en el contenedor.
