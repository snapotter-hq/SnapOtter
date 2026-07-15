---
description: "Detecta y desenfoca caras automáticamente en imágenes con detección facial por IA para privacidad y anonimización conforme al RGPD."
i18n_source_hash: 314e3e16a422
i18n_provenance: human
i18n_output_hash: 83a6acb36226
---

# Desenfocar rostros y datos sensibles {#face-pii-blur}

Detecta y desenfoca caras automáticamente en imágenes usando detección facial impulsada por IA (MediaPipe).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**Procesamiento:** Asíncrono (devuelve 202, consulta `/api/v1/jobs/{jobId}/progress` para conocer el estado mediante SSE)

**Paquete de modelos:** `face-detection` (200-300 MB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen (multipart) |
| blurRadius | number | No | `30` | Radio de desenfoque aplicado a las caras detectadas (1-100) |
| sensitivity | number | No | `0.5` | Sensibilidad de la detección facial (0-1). Los valores más bajos detectan menos caras con mayor confianza |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
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
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### No Faces Detected {#no-faces-detected}

Si no se encuentran caras, el resultado incluye una advertencia:

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## Notes {#notes}

- Requiere que esté instalado el paquete de modelos `face-detection` (200-300 MB).
- El formato de salida coincide automáticamente con el de entrada.
- El array `faces` contiene las coordenadas del recuadro delimitador (x, y, width, height) de cada cara detectada.
- Aumenta `sensitivity` (más cerca de 1.0) para detectar más caras, incluidas las parcialmente ocultas.
- Admite los formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR y HDR mediante decodificación automática.
