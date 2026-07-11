---
description: "Recorta una región de un vídeo."
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: 0219539edb04
---

# Crop Video {#crop-video}

Recorta una región rectangular de un vídeo especificando el tamaño y la posición de la región.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Yes | - | Ancho de la región de recorte en píxeles (mínimo 16) |
| height | integer | Yes | - | Alto de la región de recorte en píxeles (mínimo 16) |
| x | integer | No | `0` | Desplazamiento horizontal desde la esquina superior izquierda |
| y | integer | No | `0` | Desplazamiento vertical desde la esquina superior izquierda |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Notes {#notes}

- La región de recorte debe caber dentro de las dimensiones del vídeo. Si `x + width` o `y + height` supera el tamaño de origen, la petición devuelve un error 400.
- El tamaño mínimo de recorte es de 16x16 píxeles.
- Las dimensiones se redondean a números pares, tal como exigen la mayoría de los códecs de vídeo.
