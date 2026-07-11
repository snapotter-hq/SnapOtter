---
description: "Restaura y enfoca caras borrosas o de baja calidad en imágenes con los modelos de IA GFPGAN y CodeFormer."
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: a657abedb55e
---

# Mejora de caras {#face-enhancement}

Restaura y mejora caras en imágenes usando modelos de IA (GFPGAN/CodeFormer).

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**Procesamiento:** Asíncrono (devuelve 202, consulta `/api/v1/jobs/{jobId}/progress` para conocer el estado mediante SSE)

**Paquetes de modelo:** `upscale-enhance` (5-6 GB) y `face-detection` (200-300 MB)

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen (multipart) |
| model | string | No | `"auto"` | Modelo que se usa: `auto`, `gfpgan`, `codeformer` |
| strength | number | No | `0.8` | Intensidad de la mejora (0-1). Los valores más altos producen una mejora más fuerte |
| onlyCenterFace | boolean | No | `false` | Mejora solo la cara más central/prominente |
| sensitivity | number | No | `0.5` | Sensibilidad de la detección de caras (0-1) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
```

## Respuesta {#response}

### Respuesta inicial (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progreso (SSE en `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Resultado final (mediante SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## Notas {#notes}

- Requiere tanto el paquete de modelo `upscale-enhance` (5-6 GB) como el paquete de modelo `face-detection` (200-300 MB).
- GFPGAN produce una mejora más agresiva; CodeFormer preserva mejor la identidad. `auto` selecciona el mejor modelo para la entrada.
- La salida siempre está en formato PNG para máxima calidad.
- Se genera una vista previa WebP junto a la salida de resolución completa para una visualización más rápida en el frontend.
- El parámetro `strength` mezcla la cara mejorada con el original. Usa valores más bajos (0.3-0.5) para mejoras sutiles, y valores más altos (0.7-1.0) para una restauración más fuerte.
- Admite los formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR y HDR mediante decodificación automática.
