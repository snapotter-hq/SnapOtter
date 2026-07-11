---
description: "Superpone imágenes con posición, opacidad y modos de fusión para composición."
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: 26d252315cf0
---

# Composición de imágenes {#image-composition}

Superpone una imagen sobre una imagen base con posición, opacidad y modo de fusión configurables. Útil para componer logotipos, gráficos o combinar varias imágenes.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/compose`

Acepta datos de formulario multipart con **dos** archivos de imagen y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| x | number | No | `0` | Desplazamiento horizontal de la superposición desde la esquina superior izquierda en píxeles (mín. 0) |
| y | number | No | `0` | Desplazamiento vertical de la superposición desde la esquina superior izquierda en píxeles (mín. 0) |
| opacity | number | No | `100` | Porcentaje de opacidad de la superposición (0 a 100) |
| blendMode | string | No | `"over"` | Modo de fusión de la composición |

### Modos de fusión {#blend-modes}

| Valor | Descripción |
|-------|-------------|
| `over` | Superposición normal (predeterminado) |
| `multiply` | Oscurece multiplicando los valores de los píxeles |
| `screen` | Aclara invirtiendo, multiplicando e invirtiendo de nuevo |
| `overlay` | Combina multiplicar y trama según el brillo de la base |
| `darken` | Conserva el píxel más oscuro de cada capa |
| `lighten` | Conserva el píxel más claro de cada capa |
| `hard-light` | Superposición de contraste fuerte |
| `soft-light` | Superposición de contraste sutil |
| `difference` | Diferencia absoluta entre las capas |
| `exclusion` | Similar a la diferencia pero con menor contraste |

### Campos de archivo {#file-fields}

| Nombre del campo | Obligatorio | Descripción |
|------------|----------|-------------|
| file | Sí | La imagen base/de fondo |
| overlay | Sí | La imagen superpuesta/de primer plano |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

Usando el modo de fusión multiplicar:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## Notas {#notes}

- Ambas imágenes se validan y decodifican (se admiten HEIC, RAW, PSD, SVG) antes de la composición.
- La superposición se coloca en las coordenadas exactas de píxel especificadas por `x` y `y`. No se redimensiona para ajustarse.
- Si la opacidad es menor que 100, se aplica una máscara alfa a la superposición antes de la fusión.
- La superposición puede extenderse más allá de los límites de la imagen base (se recortará).
- La orientación EXIF se aplica automáticamente a ambas imágenes antes del procesamiento.
- Las dimensiones de salida coinciden con las dimensiones de la imagen base.
