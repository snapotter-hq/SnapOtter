---
description: "Coloriza fotos en blanco y negro o en escala de grises automáticamente con el modelo de IA DDColor."
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: 4660da685ab0
---

# Colorización con IA {#ai-colorization}

Convierte fotos en blanco y negro o en escala de grises a color completo usando IA (modelo DDColor con OpenCV DNN como alternativa).

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**Procesamiento:** Asíncrono (devuelve 202, consulta `/api/v1/jobs/{jobId}/progress` para conocer el estado mediante SSE)

**Paquete de modelo:** `object-eraser-colorize` (1-2 GB)

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen (multipart) |
| intensity | number | No | `1.0` | Intensidad del color (0-1). Los valores más bajos producen una colorización más sutil |
| model | string | No | `"auto"` | Modelo que se usa: `auto`, `ddcolor`, `opencv` |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
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
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Resultado final (mediante SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## Notas {#notes}

- Requiere que el paquete de modelo `object-eraser-colorize` esté instalado (1-2 GB).
- DDColor produce resultados de mayor calidad pero es más lento; OpenCV DNN es más rápido con una calidad ligeramente inferior. `auto` usa DDColor cuando está disponible, con OpenCV como alternativa.
- El parámetro `intensity` mezcla la escala de grises original con el resultado colorizado por IA. Usa 1.0 para color completo, o valores más bajos para un aspecto vintage parcialmente desaturado.
- El formato de salida coincide automáticamente con el formato de entrada.
- Para los formatos de salida que no se pueden previsualizar en el navegador, se genera una vista previa WebP junto a la salida principal.
- Admite los formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR y HDR mediante decodificación automática.
