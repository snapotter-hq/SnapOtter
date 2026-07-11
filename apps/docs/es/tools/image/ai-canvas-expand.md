---
description: "Amplía el lienzo de una imagen con outpainting por IA, extendiéndola en cualquier dirección y rellenando las nuevas áreas para que coincidan con la original."
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: 9f207e3c862d
---

# Ampliar lienzo con IA {#ai-canvas-expand}

Amplía el lienzo de una imagen con relleno impulsado por IA (outpainting). Extiende la imagen en cualquier dirección y rellena las nuevas áreas con contenido generado por IA que coincide con la imagen existente.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**Procesamiento:** Asíncrono (devuelve 202, consulta `/api/v1/jobs/{jobId}/progress` para conocer el estado mediante SSE)

**Paquete de modelos:** `object-eraser-colorize` (1-2 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen (multipart) |
| extendTop | integer | No | `0` | Píxeles a extender por la parte superior |
| extendRight | integer | No | `0` | Píxeles a extender por la derecha |
| extendBottom | integer | No | `0` | Píxeles a extender por la parte inferior |
| extendLeft | integer | No | `0` | Píxeles a extender por la izquierda |
| tier | string | No | `"balanced"` | Nivel de calidad: `fast`, `balanced`, `high` |
| format | string | No | `"auto"` | Formato de salida: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | No | `95` | Calidad de salida (1-100) |

Al menos una dirección de extensión debe ser mayor que 0.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Notes {#notes}

- Requiere que esté instalado el paquete de modelos `object-eraser-colorize` (1-2 GB).
- Usa outpainting basado en LaMa para generar contenido en las regiones ampliadas.
- El parámetro `tier` intercambia velocidad por calidad: `fast` produce resultados rápidamente con posibles artefactos, `high` tarda más pero produce rellenos más suaves y coherentes.
- Los valores de extensión están en píxeles. Las dimensiones finales de la imagen serán: ancho original + extendLeft + extendRight por alto original + extendTop + extendBottom.
- Para formatos de salida que no se pueden previsualizar en el navegador (HEIC, JXL, TIFF), se genera una previsualización WebP junto a la salida principal.
- Admite los formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR y HDR mediante decodificación automática.
