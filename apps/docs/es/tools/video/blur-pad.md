---
description: "Rellena las barras con una copia difuminada del vídeo."
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: 2f7c0cc38941
---

# Relleno difuminado {#blur-pad}

Ajusta un vídeo a una relación de aspecto objetivo rellenando el área de relleno con una copia difuminada y escalada del vídeo en lugar de barras de color sólido.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| target | string | No | `"16:9"` | Relación de aspecto objetivo: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | No | `20` | Sigma del desenfoque gaussiano para el fondo (2-50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notes {#notes}

- Los valores de desenfoque más altos producen un fondo más suave y abstracto. Los valores más bajos mantienen más detalle visible.
- Si el vídeo ya coincide con la relación de aspecto objetivo, el archivo se devuelve sin cambios.
- Para un relleno de color sólido, usa la herramienta Aspect Pad en su lugar.
