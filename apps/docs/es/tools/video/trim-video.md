---
description: "Extrae un clip de un vídeo especificando los tiempos de inicio y fin."
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: a6ed8f42acad
---

# Trim Video {#trim-video}

Extrae un clip de un vídeo especificando los tiempos de inicio y fin en segundos, con una opción de cortes exactos por fotograma.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Tiempo de inicio en segundos (debe ser >= 0) |
| endS | number | Yes | - | Tiempo de fin en segundos (debe ser posterior a startS) |
| precise | boolean | No | `false` | Recodificar para cortes exactos por fotograma en lugar de la búsqueda por fotograma clave |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Cuando `precise` es `false` (el valor predeterminado), la herramienta usa la búsqueda por fotograma clave, que es rápida pero puede comenzar unos fotogramas antes del tiempo solicitado.
- Establecer `precise` en `true` recodifica el segmento para límites de fotograma exactos, pero tarda más.
- El valor `endS` debe ser mayor que `startS`.
