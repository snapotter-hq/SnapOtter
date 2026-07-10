---
description: "Convierte un conjunto de imágenes en un vídeo de presentación."
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: 54303c23defe
---

# Images to Video {#images-to-video}

Convierte un conjunto de imágenes en un vídeo de presentación con duración por imagen, resolución y velocidad de fotogramas configurables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Acepta datos de formulario multipart con dos o más archivos de imagen y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | Duración de visualización por imagen en segundos (0.5-10) |
| resolution | string | No | `"720p"` | Resolución de salida: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Velocidad de fotogramas de salida (10-60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- Acepta de 2 a 60 archivos de imagen por petición. Las imágenes aparecen en el vídeo en el orden de subida.
- Las imágenes se redimensionan y se rellenan para ajustarse a la resolución objetivo conservando la relación de aspecto.
- La opción de resolución `square` produce un vídeo de 1080x1080, útil para redes sociales.
- El formato de salida siempre es MP4 (H.264).
