---
description: "Convierte un GIF animado en un vídeo MP4, WebM o MOV."
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: 48f8638bf4f1
---

# GIF to Video {#gif-to-video}

Convierte un GIF animado en un archivo de vídeo compacto MP4, WebM o MOV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

Acepta datos de formulario multipart con un archivo GIF y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Formato de salida: `mp4`, `webm`, `mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- Convertir un GIF en vídeo normalmente reduce el tamaño de archivo entre un 80 y un 90 % manteniendo la misma calidad visual.
- Solo se aceptan archivos GIF animados. Las imágenes estáticas deben usar la herramienta Convert de imagen.
- MP4 y MOV usan codificación H.264, WebM usa VP9.
