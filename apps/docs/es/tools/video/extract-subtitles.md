---
description: "Extrae la pista de subtítulos de un vídeo como un archivo SRT, WebVTT o ASS."
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: 9b9da2aa2e9d
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

Extrae la pista de subtítulos incrustada de un contenedor de vídeo y la descarga como un archivo SRT, WebVTT o ASS.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Acepta datos de formulario multipart con un archivo de vídeo y una cadena JSON `settings` opcional.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | Formato de salida: `srt`, `vtt` (WebVTT) o `ass` |

Se extrae la primera pista de subtítulos que se encuentra en el contenedor de vídeo.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- El vídeo debe contener una pista de subtítulos incrustada. Si no se encuentra ninguna pista de subtítulos, la petición devuelve un error 400.
- Si el vídeo tiene varias pistas de subtítulos, se extrae la primera.
- Las pistas de texto (SubRip, ASS, mov_text, WebVTT) se convierten a cualquiera de los tres formatos de salida. Al convertir una pista ASS a SRT o WebVTT se pierden su posicionamiento y sus efectos.
- Las pistas basadas en imágenes (Blu-ray PGS, DVD VobSub) no se pueden convertir en texto sin OCR y devuelven un error 422.
