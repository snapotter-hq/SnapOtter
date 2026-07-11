---
description: "Extrae fotogramas de un vídeo como un ZIP de imágenes."
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: 96639415435f
---

# Video to Frames {#video-to-frames}

Extrae fotogramas individuales de un vídeo y descárgalos como un archivo ZIP de imágenes PNG o JPG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | Modo de extracción: `all`, `nth`, `timestamps` |
| n | integer | No | `10` | Extraer cada N-ésimo fotograma (2-1000). Solo se usa cuando el modo es `"nth"` |
| timestamps | string | No | `""` | Marcas de tiempo en segundos separadas por comas. Obligatorio cuando el modo es `"timestamps"` |
| format | string | No | `"png"` | Formato de imagen para los fotogramas extraídos: `png`, `jpg` |

## Example Request {#example-request}

Extraer cada 30º fotograma como JPG:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

Extraer fotogramas en marcas de tiempo específicas:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- El modo `all` extrae cada fotograma y puede producir archivos ZIP muy grandes para vídeos largos. Usa el modo `nth` o `timestamps` para una extracción selectiva.
- PNG conserva toda la calidad pero produce archivos más grandes. JPG es más pequeño pero con pérdida.
- La respuesta se descarga como un archivo ZIP que contiene archivos de imagen numerados secuencialmente.
