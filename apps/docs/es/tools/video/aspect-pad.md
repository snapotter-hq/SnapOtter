---
description: "Añade barras de color sólido para ajustarse a una relación de aspecto objetivo."
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: 8cec883253e1
---

# Relleno de aspecto {#aspect-pad}

Añade barras de letterbox o pillarbox de color sólido para ajustar un vídeo a una relación de aspecto objetivo sin recortarlo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| target | string | No | `"9:16"` | Relación de aspecto objetivo: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | No | `"#000000"` | Color hexadecimal para las barras de relleno (p. ej. `"#000000"` para negro) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- Si el vídeo ya coincide con la relación de aspecto objetivo, el archivo se devuelve sin cambios.
- Usa `9:16` para formatos verticales/de retrato de redes sociales (TikTok, Reels, Shorts).
- Para un relleno difuminado en lugar de color sólido, usa la herramienta Blur Pad.
