---
description: "Elimina objetos no deseados de imágenes con inpainting por IA (LaMa), guiado por una máscara de la región que se va a borrar."
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: 250500e08685
---

# Borrador de objetos {#object-eraser}

Elimina objetos no deseados de imágenes usando inpainting por IA (modelo LaMa). Acepta una imagen y una máscara que indica la región que se va a borrar.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**Procesamiento:** Asíncrono (devuelve 202, consulta `/api/v1/jobs/{jobId}/progress` para conocer el estado mediante SSE)

**Paquete de modelo:** `object-eraser-colorize` (1-2 GB)

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen de origen (multipart) |
| mask | file | Sí | - | Imagen de máscara (blanco = área que se borra, negro = se conserva). Debe subirse con el nombre de campo `mask` |
| format | string | No | `"auto"` | Formato de salida: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | No | `95` | Calidad de salida (1-100) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
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
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Resultado final (mediante SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## Notas {#notes}

- Requiere que el paquete de modelo `object-eraser-colorize` esté instalado (1-2 GB).
- La máscara debe tener las mismas dimensiones que la imagen de origen. Los píxeles blancos indican las áreas que se van a borrar; la IA las rellena con contenido plausible.
- Usa LaMa (Large Mask Inpainting) para una eliminación de objetos de alta calidad.
- Para los formatos de salida que no se pueden previsualizar en el navegador, se genera una vista previa WebP junto a la salida principal.
- Admite los formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR y HDR mediante decodificación automática.
