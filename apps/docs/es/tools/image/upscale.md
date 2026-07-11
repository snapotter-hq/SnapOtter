---
description: "Amplía imágenes de 2x a 4x con la superresolución por IA Real-ESRGAN conservando el detalle fino."
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: 7b346c0caa22
---

# Ampliación de imágenes {#image-upscaling}

Mejora por superresolución con IA usando Real-ESRGAN. Amplía imágenes de 2x a 4x conservando el detalle.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**Procesamiento:** Asíncrono (devuelve 202, sondea `/api/v1/jobs/{jobId}/progress` para conocer el estado mediante SSE)

**Paquete de modelos:** `upscale-enhance` (5-6 GB)

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen (multipart) |
| scale | number | No | `2` | Factor de ampliación (por ejemplo, 2, 3, 4) |
| model | string | No | `"auto"` | Modelo a usar (por ejemplo, `auto`, nombres de modelos específicos) |
| faceEnhance | boolean | No | `false` | Aplica mejora de caras durante la ampliación |
| denoise | number | No | `0` | Intensidad de reducción de ruido (0 = desactivado) |
| format | string | No | `"auto"` | Formato de salida: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | No | `95` | Calidad de salida (1-100) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
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
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Resultado final (mediante SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## Notas {#notes}

- Requiere que el paquete de modelos `upscale-enhance` esté instalado (5-6 GB).
- Usa Real-ESRGAN cuando está disponible; recurre a la interpolación Lanczos si el modelo de IA no está disponible.
- La opción `faceEnhance` aplica la restauración de caras GFPGAN durante la ampliación para una mejor calidad de las caras.
- Para los formatos de salida no previsualizables en el navegador (HEIC, JXL, TIFF), se genera una vista previa WebP junto con la salida principal.
- Admite los formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR y HDR mediante decodificación automática.
