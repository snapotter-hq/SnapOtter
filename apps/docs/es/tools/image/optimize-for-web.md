---
description: "Optimiza imágenes para la web con conversión de formato, control de calidad, redimensionamiento y eliminación de metadatos."
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: 4b8b70e5a50d
---

# Optimizar para la web {#optimize-for-web}

Optimiza imágenes para la entrega web en un solo paso. Combina conversión de formato, ajuste de calidad, redimensionamiento opcional, codificación progresiva y eliminación de metadatos.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

También hay disponible un endpoint de vista previa en vivo en `POST /api/v1/tools/image/optimize-for-web/preview`, que devuelve la imagen procesada directamente como binario (sin crear un espacio de trabajo) para el ajuste de parámetros en tiempo real.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| format | string | No | `"webp"` | Formato de salida: `webp`, `jpeg`, `avif`, `png`, `jxl` |
| quality | number | No | `80` | Calidad de salida (1-100) |
| maxWidth | number | No | - | Ancho máximo en píxeles. La imagen se reduce si es más ancha. |
| maxHeight | number | No | - | Alto máximo en píxeles. La imagen se reduce si es más alta. |
| progressive | boolean | No | `true` | Habilitar la codificación progresiva/entrelazada |
| stripMetadata | boolean | No | `true` | Eliminar los metadatos EXIF, GPS, ICC y XMP |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

Optimizar para AVIF con compresión agresiva:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### Respuesta del endpoint de vista previa {#preview-endpoint-response}

El endpoint de vista previa (`/api/v1/tools/image/optimize-for-web/preview`) devuelve la imagen binaria directamente con cabeceras informativas:

- `X-Original-Size` - Tamaño del archivo original en bytes
- `X-Processed-Size` - Tamaño del archivo procesado en bytes
- `X-Output-Filename` - Nombre del archivo de salida codificado como URL

## Notas {#notes}

- Esta herramienta está diseñada como una canalización de optimización todo en uno para recursos web. Se encarga de la conversión de formato, el ajuste de calidad, la limitación de dimensiones máximas y la eliminación de metadatos en una sola pasada.
- La extensión del nombre del archivo de salida se actualiza para coincidir con el formato elegido.
- La codificación JXL (JPEG XL) usa un codificador de CLI especializado. La imagen se procesa primero como PNG y luego se codifica a JXL.
- La codificación progresiva mejora el tiempo de carga percibido en JPEG y PNG al permitir que los navegadores muestren una vista previa de baja calidad antes de que se cargue la imagen completa.
- El endpoint de vista previa es más ligero (sin creación de espacio de trabajo ni de trabajo) y está pensado para la interfaz de ajuste de parámetros en vivo del frontend.
