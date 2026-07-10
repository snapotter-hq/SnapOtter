---
description: "Extrae la pista de audio de un vídeo."
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: 03048201c823
---

# Extract Audio {#extract-audio}

Extrae la pista de audio de un archivo de vídeo y la guarda como MP3, WAV, M4A u OGG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Formato de audio de salida: `mp3`, `wav`, `m4a`, `ogg` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Si el vídeo no tiene pista de audio, la petición devuelve un error 400.
- MP3 tiene pérdida pero es ampliamente compatible. WAV es sin pérdida pero grande. M4A (AAC) ofrece un buen equilibrio entre calidad y tamaño. OGG está disponible para flujos de trabajo con códecs abiertos.
- Cuando el audio de origen ya es AAC y el formato de salida es M4A, la pista de audio se copia sin recodificar.
