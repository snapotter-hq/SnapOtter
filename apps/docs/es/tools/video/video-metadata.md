---
description: "Elimina los metadatos de un vídeo e informa de lo que se encontró."
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: 494ab59d19a6
---

# Clean Video Metadata {#clean-video-metadata}

Elimina los metadatos (fecha de creación, coordenadas GPS, modelo de cámara, etiquetas de software, etc.) de un vídeo e informa de lo que se eliminó.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

Acepta datos de formulario multipart con un archivo de vídeo. Esta herramienta no tiene ajustes configurables.

## Parameters {#parameters}

Esta herramienta no tiene parámetros. Elimina todos los metadatos del contenedor de vídeo.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip_clean.mp4",
  "originalSize": 12500000,
  "processedSize": 12480000,
  "metadata": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "durationS": 42.5,
    "bitrateKbps": 2350,
    "streams": [
      { "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
      { "type": "audio", "codec": "aac", "sampleRate": 48000 }
    ]
  }
}
```

## Notes {#notes}

- Los metadatos eliminados incluyen marcas de tiempo de creación, datos de GPS/ubicación, información de cámara/dispositivo y etiquetas de software.
- Los flujos de vídeo y audio se copian sin recodificar, por lo que no hay pérdida de calidad.
- Útil para la privacidad antes de compartir vídeos públicamente.
