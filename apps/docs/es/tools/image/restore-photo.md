---
description: "Repara arañazos, roturas y daños en fotos antiguas con una canalización de IA para restauración, mejora de rostros y color."
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: c888cfd7f62b
---

# Restauración de fotos {#photo-restoration}

Repara arañazos, roturas y daños en fotos antiguas mediante una canalización de IA de varios pasos. Combina la reparación de arañazos, la mejora de rostros, la reducción de ruido y la coloración opcional.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**Procesamiento:** asíncrono (devuelve 202, consulta `/api/v1/jobs/{jobId}/progress` para conocer el estado vía SSE)

**Paquete del modelo:** `photo-restoration` (4-5 GB)

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen (multipart) |
| scratchRemoval | boolean | No | `true` | Eliminar arañazos y daños superficiales |
| faceEnhancement | boolean | No | `true` | Mejorar los rostros en la foto restaurada |
| fidelity | number | No | `0.7` | Fidelidad de la mejora de rostros (0-1). Los valores más altos conservan más los rasgos originales |
| denoise | boolean | No | `true` | Aplicar reducción de ruido al resultado restaurado |
| denoiseStrength | number | No | `25` | Intensidad de la reducción de ruido (0-100) |
| colorize | boolean | No | `false` | Colorear la foto restaurada (para imágenes en escala de grises) |
| colorizeStrength | number | No | `85` | Intensidad de la coloración (0-100) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
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
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Resultado final (vía SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## Notas {#notes}

- Requiere que el paquete del modelo `photo-restoration` esté instalado (4-5 GB).
- La canalización ejecuta varios pasos de IA de forma secuencial: reparación de arañazos, mejora de rostros (GFPGAN), reducción de ruido y, opcionalmente, coloración.
- El array `steps` del resultado muestra qué pasos de procesamiento se ejecutaron realmente.
- `scratchCoverage` es un porcentaje estimado del área de la imagen que tenía daños por arañazos.
- `fidelity` controla con cuánta intensidad se mejoran los rostros frente a conservar la apariencia original. Los valores más bajos producen una mejora más agresiva; los valores más altos son más conservadores.
- La opción `colorize` detecta automáticamente si la imagen está en escala de grises. El indicador `isGrayscale` del resultado confirma esta detección.
- El formato de salida coincide automáticamente con el formato de entrada.
- Admite los formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR, HDR y AVIF mediante decodificación automática.
