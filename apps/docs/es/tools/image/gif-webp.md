---
description: "Convierte GIF animados a WebP y viceversa, conservando todos los fotogramas."
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: 797bdb127ac0
---

# Convertidor GIF/WebP {#gif-webp-converter}

Convierte archivos GIF animados a WebP y viceversa, conservando todos los fotogramas y la sincronización de la animación. Las animaciones WebP suelen ser entre un 25 % y un 35 % más pequeñas que los GIF equivalentes.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

Acepta datos de formulario multipart con un archivo GIF o WebP y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| quality | integer | No | `80` | Calidad de salida para la codificación WebP (1-100) |
| lossless | boolean | No | `false` | Usar compresión WebP sin pérdidas |
| resizePercent | integer | No | `100` | Escalar la salida por porcentaje (10-100) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## Notas {#notes}

- Solo se aceptan archivos `.gif` y `.webp`. Esta herramienta no admite otros formatos de imagen.
- La dirección de la conversión es automática: la entrada GIF produce una salida WebP, y la entrada WebP produce una salida GIF.
- Las opciones `quality` y `lossless` solo se aplican al codificar a WebP. Al convertir a GIF, la salida usa la paleta GIF estándar.
- Usa `resizePercent` para reducir las dimensiones (y el tamaño del archivo) de las animaciones grandes.
