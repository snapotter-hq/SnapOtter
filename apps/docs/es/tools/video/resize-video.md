---
description: "Escala un vídeo a una nueva resolución o tamaño preajustado."
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: 263be96e85c6
---

# Resize Video {#resize-video}

Escala un vídeo a una nueva resolución usando dimensiones de píxeles personalizadas o un preajuste estándar.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Ancho objetivo en píxeles (16-7680) |
| height | integer | No | - | Alto objetivo en píxeles (16-4320) |
| preset | string | No | `"custom"` | Preajuste de resolución: `custom`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |

Cuando `preset` es `"custom"`, se debe proporcionar al menos uno de `width` o `height`. La otra dimensión se escala proporcionalmente.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

Redimensionar a dimensiones personalizadas:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- Los valores de preajuste se corresponden con alturas estándar (por ejemplo, `720p` = 1280x720, `1080p` = 1920x1080). El ancho se escala proporcionalmente a partir de la relación de aspecto de origen.
- Las dimensiones se redondean a números pares, tal como exigen la mayoría de los códecs de vídeo.
- La resolución máxima admitida es 7680x4320 (8K UHD).
