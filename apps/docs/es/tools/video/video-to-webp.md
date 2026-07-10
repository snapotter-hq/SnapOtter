---
description: "Convierte un clip de vídeo en una imagen WebP animada."
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: 9a8a0a4ffb44
---

# Video to WebP {#video-to-webp}

Convierte un clip de vídeo en una imagen WebP animada con velocidad de fotogramas, ancho y calidad configurables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Velocidad de fotogramas de salida (1-30) |
| width | integer | No | `480` | Ancho de salida en píxeles (16-1920). El alto se escala proporcionalmente |
| quality | integer | No | `75` | Calidad de compresión WebP (1-100) |
| loop | boolean | No | `true` | Reproducir la animación en bucle |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- El WebP animado produce archivos más pequeños que el GIF con mejor compatibilidad de color (paleta de 24 bits frente a 8 bits).
- Los valores más bajos de `quality` producen archivos más pequeños a costa de la fidelidad visual.
- Establece `loop` en `false` para animaciones que deban reproducirse una vez y detenerse.
