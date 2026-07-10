---
description: "Compara dos imágenes lado a lado con visualización de diferencias a nivel de píxel y puntuación de similitud."
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: e74ad295a52e
---

# Comparar imágenes {#image-compare}

Sube dos imágenes para calcular un mapa de diferencias a nivel de píxel y un porcentaje numérico de similitud. La salida es una imagen de diferencias que resalta en rojo las regiones que cambiaron.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/compare`

Acepta datos de formulario multipart con **dos** archivos de imagen. No se necesita ningún campo de ajustes.

## Parámetros {#parameters}

Esta herramienta no tiene parámetros configurables. Sube exactamente dos archivos de imagen.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|----------|-------------|
| file (primero) | file | Sí | La primera imagen |
| file (segundo) | file | Sí | La segunda imagen |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## Campos de respuesta {#response-fields}

| Campo | Tipo | Descripción |
|-------|------|-------------|
| jobId | string | Identificador del trabajo para descargar la imagen de diferencias |
| similarity | number | Porcentaje de similitud entre las dos imágenes (0 a 100) |
| dimensions | object | Ancho y alto usados para la comparación |
| downloadUrl | string | URL para descargar la imagen de diferencias generada |
| originalSize | number | Tamaño combinado de ambas imágenes de entrada en bytes |
| processedSize | number | Tamaño de la imagen de diferencias de salida en bytes |

## Notas {#notes}

- Ambas imágenes se redimensionan a las mismas dimensiones (el máximo de cada eje) antes de la comparación.
- La imagen de diferencias resalta las diferencias en rojo con una opacidad proporcional a la magnitud del cambio. Los píxeles idénticos o casi idénticos (diferencia < 10) se muestran como versiones semitransparentes del original.
- La similitud se calcula como el inverso de la diferencia media de píxeles en todos los píxeles, expresada como porcentaje.
- Una similitud del 100 % significa que las imágenes son idénticas píxel a píxel (a la resolución de comparación).
- La salida de diferencias siempre está en formato PNG, sin importar los formatos de entrada.
- Ambas imágenes se validan y decodifican (se admiten HEIC, RAW, PSD, SVG) antes de la comparación.
- La orientación EXIF se aplica automáticamente a ambas imágenes antes del procesamiento.
