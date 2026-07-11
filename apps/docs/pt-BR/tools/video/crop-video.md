---
description: "Recorta uma região de um vídeo."
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: 39215795b014
---

# Crop Video {#crop-video}

Recorta uma região retangular de um vídeo especificando o tamanho e a posição da região.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| width | integer | Sim | - | Largura da região de recorte em pixels (mínimo 16) |
| height | integer | Sim | - | Altura da região de recorte em pixels (mínimo 16) |
| x | integer | Não | `0` | Deslocamento horizontal a partir do canto superior esquerdo |
| y | integer | Não | `0` | Deslocamento vertical a partir do canto superior esquerdo |

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

- A região de recorte deve caber dentro das dimensões do vídeo. Se `x + width` ou `y + height` exceder o tamanho da origem, a requisição retorna um erro 400.
- O tamanho mínimo de recorte é 16x16 pixels.
- As dimensões são arredondadas para números pares, conforme exigido pela maioria dos codecs de vídeo.
