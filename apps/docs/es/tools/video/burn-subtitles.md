---
description: "Renderiza subtítulos de forma permanente sobre los fotogramas del vídeo."
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: 68b34abe14bd
---

# Burn Subtitles {#burn-subtitles}

Renderiza de forma permanente (incrusta) subtítulos de un archivo SRT, VTT o ASS sobre cada fotograma de un vídeo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

Acepta datos de formulario multipart con un archivo de vídeo y un archivo de subtítulos. Este es un endpoint asíncrono: devuelve `202 Accepted` de inmediato y el progreso se transmite vía SSE en `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | Tamaño de fuente del subtítulo en píxeles (8-72) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Sube dos archivos: el primero debe ser un vídeo y el segundo un archivo de subtítulos (.srt, .vtt o .ass).
- Los subtítulos incrustados forman parte permanente del vídeo y el espectador no puede desactivarlos. Para subtítulos que se puedan activar y desactivar, usa la herramienta Embed Subtitles en su lugar.
- Las actualizaciones de progreso están disponibles vía SSE en `GET /api/v1/jobs/{jobId}/progress` hasta que el trabajo se completa.
