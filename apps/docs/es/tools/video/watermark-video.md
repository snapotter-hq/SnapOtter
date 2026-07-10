---
description: "Incrusta una marca de agua de texto en los fotogramas del vídeo."
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: 95035d60ba89
---

# Watermark Video {#watermark-video}

Incrusta una marca de agua de texto en cada fotograma de un vídeo con posición, tamaño, opacidad y color configurables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Texto de la marca de agua (1-200 caracteres) |
| position | string | No | `"br"` | Posición en el fotograma: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `36` | Tamaño de fuente en píxeles (8-120) |
| opacity | number | No | `0.5` | Opacidad de la marca de agua (0.05-1) |
| color | string | No | `"#ffffff"` | Color hexadecimal para el texto (por ejemplo, `"#ffffff"`) |

### Position Values {#position-values}

- **tl** - Arriba a la izquierda, **tc** - Arriba al centro, **tr** - Arriba a la derecha
- **l** - Centro a la izquierda, **c** - Centro, **r** - Centro a la derecha
- **bl** - Abajo a la izquierda, **bc** - Abajo al centro, **br** - Abajo a la derecha

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- La marca de agua se renderiza de forma permanente en los fotogramas del vídeo y no puede eliminarse después del procesamiento.
- La marca de agua usa una fuente sans-serif integrada en FFmpeg.
- Para marcas de agua de imagen, usa la herramienta Watermark de imagen en su lugar.
