---
description: "Detección y corrección con IA de los ojos rojos causados por el flash de la cámara."
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: 200bc64cd839
---

# Eliminación de ojos rojos {#red-eye-removal}

Detección y corrección con IA de los ojos rojos causados por el flash de la cámara.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**Procesamiento:** asíncrono (devuelve 202, consulta `/api/v1/jobs/{jobId}/progress` para conocer el estado vía SSE)

**Paquete del modelo:** `face-detection` (200-300 MB)

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen (multipart) |
| sensitivity | number | No | `50` | Sensibilidad de detección de ojos rojos (0-100). Los valores más altos detectan ojos rojos más sutiles |
| strength | number | No | `70` | Intensidad de la corrección (0-100). Con cuánta agresividad se neutraliza el rojo |
| format | string | No | - | Formato de salida (anulación opcional) |
| quality | number | No | `90` | Calidad de salida (1-100) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
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
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### Resultado final (vía SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## Notas {#notes}

- Requiere que el paquete del modelo `face-detection` esté instalado (200-300 MB).
- Primero detecta los rostros, luego localiza las regiones de los ojos dentro de cada rostro y, por último, identifica y corrige los píxeles de ojos rojos.
- El recuento `facesDetected` indica cuántos rostros se encontraron; `eyesCorrected` es el número total de ojos individuales a los que se corrigieron los ojos rojos.
- La salida es siempre PNG para conservar la máxima calidad.
- Admite los formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR y HDR mediante decodificación automática.
