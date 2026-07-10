---
description: "Eliminación de ruido y grano con IA y opciones de calidad de varios niveles."
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: 4b655b9abb69
---

# Eliminación de ruido {#noise-removal}

Eliminación de ruido y grano con IA y opciones de calidad de varios niveles, mediante el sidecar de Python (modelo SCUNet).

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**Procesamiento:** asíncrono (devuelve 202, consulta `/api/v1/jobs/{jobId}/progress` para conocer el estado vía SSE)

**Paquete del modelo:** `upscale-enhance` (5-6 GB)

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen (multipart) |
| tier | string | No | `"balanced"` | Nivel de calidad: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | No | `50` | Intensidad del reductor de ruido (0-100) |
| detailPreservation | number | No | `50` | Cuánto detalle conservar (0-100). Valores más altos mantienen más textura |
| colorNoise | number | No | `30` | Intensidad de la reducción del ruido de color (0-100) |
| format | string | No | `"original"` | Formato de salida: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | `90` | Calidad de codificación de salida (1-100) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Resultado final (vía SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## Notas {#notes}

- Requiere que el paquete del modelo `upscale-enhance` esté instalado (5-6 GB).
- Los niveles de calidad intercambian velocidad por calidad: `quick` es el más rápido con reducción de ruido básica, mientras que `maximum` usa el enfoque multipasada más exhaustivo.
- El parámetro `detailPreservation` es fundamental para sujetos con textura (tejido, cabello, follaje). Los valores más altos evitan que el reductor de ruido suavice el detalle fino.
- Cuando `format` se establece en `"original"`, el formato de salida coincide con el formato del archivo de entrada.
- Admite los formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR y HDR mediante decodificación automática.
