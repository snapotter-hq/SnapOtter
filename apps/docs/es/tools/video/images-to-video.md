---
description: "Convierte un conjunto de imágenes en un vídeo de presentación, un GIF animado o un WebP animado."
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: 317d2b92f922
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

Convierte un conjunto de imágenes en un vídeo de presentación con duración por imagen, resolución y velocidad de fotogramas configurables, o en un GIF o WebP animado con un tiempo fijo por fotograma y un número de repeticiones.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Acepta datos de formulario multipart con dos o más archivos de imagen y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | Formato de salida: `mp4`, `gif`, `webp` |
| secondsPerImage | number | No | `2` | Solo MP4. Duración de visualización por imagen en segundos (0.5-10) |
| resolution | string | No | `"720p"` | Solo MP4. Resolución de salida: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Solo MP4. Velocidad de fotogramas de salida (10-60) |
| frameDelayMs | integer | No | `500` | Solo GIF y WebP. Tiempo que se muestra cada imagen, en milisegundos (20-10000) |
| loop | integer | No | `0` | Solo GIF y WebP. Cuántas veces se reproduce la animación; `0` se repite sin fin (0-100) |

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

Para crear un GIF animado que muestre cada imagen durante 200 ms:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
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
- En MP4, las imágenes se redimensionan y se rellenan para ajustarse a la resolución objetivo conservando la relación de aspecto.
- La opción de resolución `square` produce un vídeo de 1080x1080, útil para redes sociales.
- La salida MP4 es H.264 y se llama `slideshow.mp4`.
- La salida GIF y WebP usa el tamaño de la primera imagen. Las imágenes de otros tamaños se escalan para caber en ella, y el área sobrante es transparente. El archivo se llama `slideshow.gif` o `slideshow.webp`.
- GIF guarda los tiempos de fotograma en centésimas de segundo, así que `frameDelayMs` se redondea a los 10 ms más cercanos en un GIF. WebP conserva el valor exacto.
- Las animaciones grandes se rechazan en lugar de generarse: el tamaño del fotograma multiplicado por el número de imágenes debe mantenerse por debajo del mismo límite de píxeles que usan las herramientas de GIF.
