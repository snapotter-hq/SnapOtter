---
description: "Combina varias imágenes en una sola hoja de sprites en cuadrícula con metadatos de fotogramas."
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: a648f6f028fb
---

# Hoja de sprites {#sprite-sheet}

Combina varias imágenes en una sola hoja de sprites en cuadrícula. Cada imagen se redimensiona para coincidir con las dimensiones de la primera imagen y se coloca en la cuadrícula. Devuelve la imagen de la hoja de sprites junto con metadatos de coordenadas por fotograma.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

Acepta datos de formulario multipart con dos o más archivos de imagen y un campo `settings` en JSON.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| columns | integer | No | `4` | Número de columnas en la cuadrícula (1-16) |
| padding | integer | No | `0` | Relleno entre celdas en píxeles (0-64) |
| background | string | No | `"#ffffff"` | Color de fondo en hexadecimal |
| format | string | No | `"png"` | Formato de salida: `png`, `webp` o `jpeg` |
| quality | integer | No | `90` | Calidad de salida (1-100) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Notas {#notes}

- Acepta de 2 a 64 imágenes. Todas las imágenes se redimensionan para coincidir con las dimensiones de la primera imagen subida.
- El arreglo `frames` proporciona las coordenadas exactas en píxeles de cada fotograma en la salida, aptas para definiciones de sprites CSS o mapas de fotogramas de motores de juegos.
- El número de filas se calcula automáticamente a partir del recuento de imágenes y el valor de `columns`.
- Usa el parámetro `padding` para agregar espacio entre celdas. El color `background` es visible en las áreas de relleno y en cualquier celda final vacía.
- Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del procesamiento.
