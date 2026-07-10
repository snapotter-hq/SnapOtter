---
description: "Reduce el tamaño del archivo de imagen por nivel de calidad o hasta un tamaño de archivo objetivo."
i18n_source_hash: af4685da7e64
i18n_provenance: human
i18n_output_hash: 2bec513af1bd
---

# Comprimir {#compress}

Reduce el tamaño del archivo de imagen especificando un nivel de calidad o un tamaño de archivo objetivo en kilobytes. La herramienta usa búsqueda binaria iterativa para alcanzar los tamaños objetivo con precisión.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/compress`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | Modo de compresión: `quality` o `targetSize` |
| quality | number | No | `80` | Nivel de calidad (1-100). Se usa cuando el modo es `quality`. |
| targetSizeKb | number | No | - | Tamaño de archivo objetivo en kilobytes. Se usa cuando el modo es `targetSize`. |

## Ejemplo de solicitud {#example-request}

Comprimir a calidad 60:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Comprimir a un tamaño objetivo de 200 KB:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Notas {#notes}

- En el modo `quality`, los valores más bajos producen archivos más pequeños con más artefactos de compresión. Un valor de 80 es un buen valor predeterminado para uso web.
- En el modo `targetSize`, el motor realiza una compresión iterativa para acercarse lo máximo posible al objetivo sin superarlo.
- El formato de salida coincide con el formato de entrada. La compresión se aplica a la codificación nativa del formato (p. ej. calidad JPEG para archivos JPEG, calidad WebP para archivos WebP).
- Si la calidad predeterminada (80) es aceptable, puedes omitir por completo el parámetro `quality`.
