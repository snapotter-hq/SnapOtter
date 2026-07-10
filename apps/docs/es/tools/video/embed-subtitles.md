---
description: "Multiplexa una pista de subtítulos en el contenedor del vídeo."
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: f1744ae8e1c6
---

# Embed Subtitles {#embed-subtitles}

Multiplexa un archivo de subtítulos en el contenedor del vídeo como una pista de subtítulos blanda que el espectador puede activar o desactivar.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

Acepta datos de formulario multipart con un archivo de vídeo y un archivo de subtítulos, además de un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | Código de idioma ISO 639-2/B (3 letras minúsculas, por ejemplo `"eng"`, `"fra"`, `"deu"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Notes {#notes}

- Sube dos archivos: el primero debe ser un vídeo y el segundo un archivo de subtítulos (.srt, .vtt o .ass).
- Los subtítulos incrustados (blandos) pueden activarse y desactivarse por el espectador en su reproductor multimedia. Para subtítulos permanentemente visibles, usa la herramienta Burn Subtitles en su lugar.
- El código de idioma se almacena como metadato en el contenedor y ayuda a los reproductores multimedia a etiquetar la pista de subtítulos.
