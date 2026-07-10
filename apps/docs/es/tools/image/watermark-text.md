---
description: "Añade marcas de agua de texto con posición, opacidad, rotación y mosaico configurables."
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: 8e4c47f60543
---

# Marca de agua de texto {#text-watermark}

Añade una superposición de marca de agua de texto a las imágenes. Admite una única colocación en las esquinas/centro o una repetición en mosaico por toda la imagen, con tamaño de fuente, color, opacidad y rotación configurables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

Acepta datos de formulario multipart con un archivo de imagen y un campo `settings` en JSON.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| text | string | Sí | - | Texto de la marca de agua (1 a 500 caracteres) |
| fontSize | number | No | `48` | Tamaño de fuente en píxeles (8 a 1000) |
| color | string | No | `"#000000"` | Color del texto en formato hexadecimal (`#RRGGBB`) |
| opacity | number | No | `50` | Porcentaje de opacidad del texto (0 a 100) |
| position | string | No | `"center"` | Ubicación: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | No | `0` | Ángulo de rotación del texto en grados (-360 a 360) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

Marca de agua en mosaico por toda la imagen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notas {#notes}

- La marca de agua se renderiza como texto SVG y se compone sobre la imagen, conservando la calidad de salida.
- El modo en mosaico espacia los elementos de texto según el tamaño de fuente (6x de espaciado horizontal, 4x de espaciado vertical), con un límite máximo de 500 elementos.
- Para las posiciones en las esquinas, el relleno desde el borde es igual al tamaño de fuente.
- La fuente utilizada es la fuente sans-serif predeterminada del sistema.
- Los caracteres especiales de XML en el texto (`&`, `<`, `>`, `"`, `'`) se escapan de forma segura.
- El formato de salida coincide con el formato de entrada. Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del procesamiento.
