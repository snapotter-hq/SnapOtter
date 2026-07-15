---
description: "Enfoca imágenes mediante métodos adaptativos, de máscara de enfoque o de paso alto, con reducción de ruido opcional."
i18n_source_hash: 66dce4068899
i18n_provenance: human
i18n_output_hash: 1be8c72c3aa0
---

# Enfocar imagen {#sharpening}

Herramienta de enfoque avanzada con tres métodos: adaptativo (inteligente y sensible a los bordes), máscara de enfoque (radio/cantidad clásicos) y paso alto (énfasis en la textura). Incluye reducción de ruido integrada para evitar artefactos de enfoque.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

Acepta datos de formulario multipart con un archivo de imagen y un campo `settings` en JSON.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| method | string | No | `"adaptive"` | Algoritmo de enfoque: `adaptive`, `unsharp-mask`, `high-pass` |
| sigma | number | No | `1.0` | Adaptativo: sigma gaussiano (0.5 a 10) |
| m1 | number | No | `1.0` | Adaptativo: enfoque de áreas planas (0 a 10) |
| m2 | number | No | `3.0` | Adaptativo: enfoque de áreas irregulares (0 a 20) |
| x1 | number | No | `2.0` | Adaptativo: umbral plano/irregular (0 a 10) |
| y2 | number | No | `12` | Adaptativo: enfoque máximo de áreas planas (0 a 50) |
| y3 | number | No | `20` | Adaptativo: enfoque máximo de áreas irregulares (0 a 50) |
| amount | number | No | `100` | Máscara de enfoque: cantidad de enfoque (0 a 1000) |
| radius | number | No | `1.0` | Máscara de enfoque: radio de desenfoque en píxeles (0.1 a 5) |
| threshold | number | No | `0` | Máscara de enfoque: diferencia mínima de brillo para enfocar (0 a 255) |
| strength | number | No | `50` | Paso alto: intensidad del filtro (0 a 100) |
| kernelSize | number | No | `3` | Paso alto: tamaño del kernel de convolución (3 o 5) |
| denoise | string | No | `"off"` | Reducción de ruido previa al enfoque: `off`, `light`, `medium`, `strong` |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

Máscara de enfoque con umbral para proteger las áreas suaves:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## Notas {#notes}

- Solo se usan los parámetros pertinentes al método elegido. Por ejemplo, `amount`, `radius` y `threshold` se ignoran cuando `method` es `adaptive`.
- El método adaptativo usa el enfoque adaptativo integrado de Sharp con un comportamiento configurable para las regiones planas/irregulares.
- La opción `denoise` aplica reducción de ruido antes del enfoque para evitar la amplificación del ruido/grano.
- El enfoque de paso alto extrae el detalle fino restando una versión desenfocada del original y luego combinándola de nuevo.
- El formato de salida coincide con el formato de entrada. Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del procesamiento.
