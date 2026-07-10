---
description: "Convierte un clip de vídeo en un GIF animado."
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: 4c14e0a22abb
---

# Video to GIF {#video-to-gif}

Convierte un clip de vídeo en un GIF animado con velocidad de fotogramas, ancho, tiempo de inicio y duración configurables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`. Este es un endpoint asíncrono: devuelve `202 Accepted` de inmediato y el progreso se transmite vía SSE en `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Velocidad de fotogramas de salida (1-30) |
| width | integer | No | `480` | Ancho de salida en píxeles (64-1280). El alto se escala proporcionalmente |
| startS | number | No | `0` | Tiempo de inicio en segundos (debe ser >= 0) |
| durationS | number | No | `5` | Duración en segundos (mayor que 0, máximo 60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Los valores más bajos de `fps` y `width` producen archivos GIF más pequeños. Un GIF de 480px de ancho a 12 fps suele ser un buen equilibrio.
- La duración máxima es de 60 segundos. Los clips más largos producen archivos muy grandes.
- Las actualizaciones de progreso están disponibles vía SSE en `GET /api/v1/jobs/{jobId}/progress` hasta que el trabajo se completa.
