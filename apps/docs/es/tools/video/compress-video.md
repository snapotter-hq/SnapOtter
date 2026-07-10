---
description: "Reduce el tamaño de archivo del vídeo con control de calidad."
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: b6eaae204589
---

# Compress Video {#compress-video}

Reduce el tamaño de archivo del vídeo usando una intensidad de compresión configurable y un escalado de resolución opcional.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`. Este es un endpoint asíncrono: devuelve `202 Accepted` de inmediato y el progreso se transmite vía SSE en `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | Intensidad de compresión: `light`, `balanced`, `strong` |
| resolution | string | No | `"original"` | Resolución de salida: `original`, `1080p`, `720p`, `480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- El preajuste `light` conserva una calidad casi original. El preajuste `strong` reduce el tamaño de archivo de forma agresiva a costa de la fidelidad visual.
- Reducir la resolución (por ejemplo, de 4K a 720p) se combina con la compresión para lograr una reducción de tamaño considerable.
- Las actualizaciones de progreso están disponibles vía SSE en `GET /api/v1/jobs/{jobId}/progress` hasta que el trabajo se completa.
