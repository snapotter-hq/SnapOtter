---
description: "Reduce el temblor de la cámara con estabilización de dos pasadas."
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: 18bcf6accb55
---

# Stabilize Video {#stabilize-video}

Reduce el temblor de la cámara en grabaciones a mano usando la estabilización vidstab de dos pasadas de FFmpeg.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`. Este es un endpoint asíncrono: devuelve `202 Accepted` de inmediato y el progreso se transmite vía SSE en `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | Tamaño de la ventana de suavizado en fotogramas (5-60). Los valores más altos producen un movimiento más suave |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- La estabilización es un proceso de dos pasadas: la primera pasada analiza el movimiento de la cámara y la segunda aplica la corrección. Esto tarda aproximadamente el doble que las herramientas de una sola pasada.
- Los valores de suavizado más altos eliminan más temblor, pero pueden introducir un ligero recorte por zoom en los bordes.
- Las actualizaciones de progreso están disponibles vía SSE en `GET /api/v1/jobs/{jobId}/progress` hasta que el trabajo se completa.
