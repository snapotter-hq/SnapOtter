---
description: "Convierte un clip de vídeo en una imagen AVIF animada."
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: 8067dfc22ea9
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

Convierte un clip de vídeo en una imagen AVIF animada con velocidad de fotogramas, ancho, calidad y rango del clip configurables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Velocidad de fotogramas de salida (1-30) |
| width | integer | No | `480` | Ancho de salida en píxeles (64-1280). El alto se escala proporcionalmente |
| startS | number | No | `0` | Dónde empieza el clip, en segundos |
| durationS | number | No | `5` | Duración del clip en segundos (hasta 60) |
| quality | integer | No | `50` | Calidad AVIF (1-100) |
| loop | boolean | No | `true` | Reproducir la animación en bucle |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

La codificación AV1 es más lenta que GIF o WebP, así que esta herramienta suele responder `202` con un trabajo que puedes seguir por SSE en `/api/v1/jobs/{jobId}/progress`. Un clip corto puede terminar dentro de la ventana síncrona y devolver el resultado directamente:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- AVIF animado está libre de regalías y suele ocupar menos que un WebP o GIF animado con la misma calidad visual.
- Los navegadores actuales reproducen AVIF animado. Algunos visores de imágenes de escritorio solo muestran el primer fotograma.
- La pista de audio se descarta.
