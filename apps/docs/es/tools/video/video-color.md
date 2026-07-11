---
description: "Ajusta el brillo, el contraste, la saturación y la gamma de un vídeo."
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: a1440b59a23a
---

# Video Color {#video-color}

Ajusta el brillo, el contraste, la saturación y la corrección de gamma de un vídeo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | Ajuste de brillo (-1 a 1) |
| contrast | number | No | `1` | Multiplicador de contraste (0-4) |
| saturation | number | No | `1` | Multiplicador de saturación (0-3). Ponlo en 0 para escala de grises |
| gamma | number | No | `1` | Corrección de gamma (0.1-10) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- Todos los valores en sus predeterminados (brillo 0, contraste 1, saturación 1, gamma 1) no producen ningún cambio.
- Establecer la saturación en `0` convierte el vídeo a escala de grises.
- Los valores de gamma por debajo de 1 aclaran las sombras, mientras que los valores por encima de 1 las oscurecen.
