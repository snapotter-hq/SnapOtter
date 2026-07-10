---
description: "Mejora automática con un solo clic que analiza una imagen y corrige la exposición, el contraste, el balance de blancos, la saturación y la nitidez."
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: 03e703fd5c5e
---

# Mejora de imagen {#image-enhancement}

Mejora automática con un solo clic y análisis inteligente. Analiza la imagen y aplica correcciones de exposición, contraste, balance de blancos, saturación, nitidez y reducción de ruido.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**Procesamiento:** síncrono (usa la fábrica `createToolRoute`, devuelve el resultado directamente)

**Paquete de modelos:** ninguno necesario para la mejora básica. El paquete `upscale-enhance` (5-6 GB) solo se usa cuando `deepEnhance` está activado (para la reducción de ruido por IA mediante SCUNet).

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen (multipart) |
| mode | string | No | `"auto"` | Modo de mejora: `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | No | `50` | Intensidad general de la mejora (0-100) |
| corrections | object | No | todas `true` | Correcciones selectivas a aplicar (ver más abajo) |
| deepEnhance | boolean | No | `false` | Activar la reducción de ruido con IA (requiere que la herramienta `noise-removal` esté instalada) |

### Objeto de correcciones {#corrections-object}

| Campo | Tipo | Predeterminado | Descripción |
|-------|------|---------|-------------|
| exposure | boolean | `true` | Corregir automáticamente la exposición |
| contrast | boolean | `true` | Corregir automáticamente el contraste |
| whiteBalance | boolean | `true` | Corregir automáticamente el balance de blancos |
| saturation | boolean | `true` | Corregir automáticamente la saturación |
| sharpness | boolean | `true` | Enfocar automáticamente |
| denoise | boolean | `true` | Reducción de ruido ligera |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## Respuesta (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Endpoint de análisis {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

Analiza una imagen y devuelve recomendaciones de corrección sin aplicarlas.

### Parámetros {#parameters-1}

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|----------|-------------|
| file | file | Sí | Archivo de imagen (multipart) |

### Ejemplo de solicitud {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### Respuesta (200 OK) {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## Notas {#notes}

- Esta herramienta usa la fábrica síncrona `createToolRoute`, por lo que devuelve una respuesta estándar (no 202 asíncrona).
- El parámetro `mode` ajusta cómo se ponderan las correcciones (p. ej., el modo retrato es más suave con los tonos de piel, el modo paisaje aumenta la saturación).
- Cuando `deepEnhance` está activado y la herramienta `noise-removal` (SCUNet) está instalada, se aplica una pasada adicional de reducción de ruido con IA tras las correcciones estándar.
- El endpoint de análisis es útil para previsualizar qué correcciones se aplicarían antes de confirmarlas.
- Admite los formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR y HDR mediante decodificación automática.
