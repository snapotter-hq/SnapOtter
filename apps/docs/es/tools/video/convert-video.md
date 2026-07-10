---
description: "Convierte vídeos entre MP4, MOV, WebM, AVI y MKV."
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: 9f306a50ad23
---

# Convert Video {#convert-video}

Convierte vídeos entre los formatos MP4, MOV, WebM, AVI y MKV con preajustes de calidad configurables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`. Este es un endpoint asíncrono: devuelve `202 Accepted` de inmediato y el progreso se transmite vía SSE en `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Formato de salida: `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | No | `"balanced"` | Preajuste de calidad: `high`, `balanced`, `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- El preajuste de calidad `high` produce la mejor fidelidad visual, pero archivos más grandes. El preajuste `small` comprime de forma agresiva para lograr el tamaño de archivo mínimo.
- La salida WebM usa codificación VP9. MP4 y MOV usan H.264. AVI y MKV están disponibles para flujos de trabajo heredados o de archivado.
- Las actualizaciones de progreso están disponibles vía SSE en `GET /api/v1/jobs/{jobId}/progress` hasta que el trabajo se completa.
