---
description: "Añade superposiciones de texto con estilo, con sombras paralelas y cajas de fondo."
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: 7f04839c8ee5
---

# Superposición de texto {#text-overlay}

Añade texto con estilo a las imágenes con una sombra paralela y una caja de fondo semitransparente opcionales. Adecuado para títulos, subtítulos o anotaciones en las fotos.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

Acepta datos de formulario multipart con un archivo de imagen y un campo `settings` en JSON.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| text | string | Sí | - | Texto a superponer (1 a 500 caracteres) |
| fontSize | number | No | `48` | Tamaño de fuente en píxeles (8 a 200) |
| color | string | No | `"#FFFFFF"` | Color del texto en formato hexadecimal (`#RRGGBB`) |
| position | string | No | `"bottom"` | Ubicación vertical: `top`, `center`, `bottom` |
| backgroundBox | boolean | No | `false` | Muestra un rectángulo de fondo semitransparente detrás del texto |
| backgroundColor | string | No | `"#000000"` | Color de la caja de fondo en formato hexadecimal (`#RRGGBB`) |
| shadow | boolean | No | `true` | Aplica una sombra paralela detrás del texto |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

Con una caja de fondo:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notas {#notes}

- El texto siempre se centra horizontalmente dentro de la imagen.
- La sombra paralela usa un desplazamiento de 2 px con un desenfoque de 3 px al 70 % de opacidad negra.
- La caja de fondo abarca todo el ancho de la imagen con un 70 % de opacidad, con una altura proporcional al tamaño de fuente (1.8x).
- El texto se renderiza mediante composición SVG, por lo que se usa la fuente sans-serif predeterminada del sistema.
- Los caracteres especiales de XML en el texto se escapan de forma segura.
- El formato de salida coincide con el formato de entrada. Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del procesamiento.
