---
description: "Une imágenes en horizontal, apiladas o en cuadrícula, con control sobre la alineación, los espacios, los bordes y el modo de redimensionado."
i18n_source_hash: 39333210505a
i18n_provenance: human
i18n_output_hash: 1679f36e5612
---

# Unir / Combinar {#stitch-combine}

Une varias imágenes en horizontal, apiladas en vertical o dispuestas en cuadrícula. Admite alineación, espacio, borde, radio de esquina y varios modos de redimensionado.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| direction | string | No | `"horizontal"` | Dirección del diseño: `horizontal`, `vertical`, `grid` |
| gridColumns | integer | No | 2 | Número de columnas cuando la dirección es `grid` (2 a 100) |
| resizeMode | string | No | `"fit"` | Cómo se redimensionan las imágenes: `fit`, `original`, `stretch`, `crop` |
| alignment | string | No | `"center"` | Alineación en el eje transversal: `start`, `center`, `end` |
| gap | number | No | 0 | Espacio entre imágenes en píxeles (0 a 1000) |
| border | number | No | 0 | Ancho del borde exterior en píxeles (0 a 500) |
| cornerRadius | number | No | 0 | Radio de esquina aplicado a la salida final (0 a 500) |
| backgroundColor | string | No | `"#FFFFFF"` | Color de fondo/borde en hexadecimal (por ejemplo, `#FF0000`) |
| format | string | No | `"png"` | Formato de salida: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | Calidad de salida (1 a 100) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## Notas {#notes}

- Requiere al menos 2 imágenes. Sube varios archivos de imagen en la solicitud multipart.
- Admite los formatos de entrada HEIC, RAW, PSD y SVG (decodificados automáticamente).
- Modos de redimensionado:
  - `fit`: escala las imágenes para coincidir con la dimensión más pequeña a lo largo del eje de unión.
  - `original`: mantiene los tamaños originales (puede producir bordes desiguales).
  - `stretch`: fuerza a las imágenes a coincidir con la dimensión más pequeña sin conservar la relación de aspecto.
  - `crop`: recorta las imágenes en modo cubierta para coincidir con la dimensión más pequeña.
- En el modo `grid`, las celdas se dimensionan a las dimensiones medianas de todas las imágenes.
- El `cornerRadius` se aplica a toda la salida final, no a las imágenes individuales.
- El tamaño del lienzo está limitado por la configuración del servidor `MAX_CANVAS_PIXELS` para evitar el agotamiento de la memoria.
