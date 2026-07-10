---
description: "Une varios clips de vídeo en un solo archivo."
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: aa06dee1a9bd
---

# Merge Videos {#merge-videos}

Une varios clips de vídeo en un único archivo MP4. Todas las entradas se normalizan a la resolución del primer vídeo y a 30 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

Acepta datos de formulario multipart con dos o más archivos de vídeo. Este es un endpoint asíncrono: devuelve `202 Accepted` de inmediato y el progreso se transmite vía SSE en `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

Esta herramienta no tiene parámetros de configuración. Sube de 2 a 10 archivos de vídeo como varias partes `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Los clips se concatenan en el orden en que se suben.
- Todos los clips se recodifican para coincidir con la resolución, la velocidad de fotogramas (30 fps) y el códec (H.264) del primer clip. Las entradas que no coinciden se normalizan automáticamente.
- Acepta de 2 a 10 archivos de vídeo por petición.
- Las actualizaciones de progreso están disponibles vía SSE en `GET /api/v1/jobs/{jobId}/progress` hasta que el trabajo se completa.
