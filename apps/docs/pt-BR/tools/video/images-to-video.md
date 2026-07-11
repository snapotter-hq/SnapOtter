---
description: "Transforma um conjunto de imagens em um vídeo de slideshow."
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: cb3d679c6722
---

# Images to Video {#images-to-video}

Transforma um conjunto de imagens em um vídeo de slideshow com duração por imagem, resolução e taxa de quadros configuráveis.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Aceita dados de formulário multipart com dois ou mais arquivos de imagem e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | Não | `2` | Duração de exibição por imagem em segundos (0.5-10) |
| resolution | string | Não | `"720p"` | Resolução de saída: `1080p`, `720p`, `square` |
| fps | integer | Não | `30` | Taxa de quadros de saída (10-60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- Aceita 2-60 arquivos de imagem por requisição. As imagens aparecem no vídeo na ordem de upload.
- As imagens são redimensionadas e preenchidas para caber na resolução de destino, preservando a proporção.
- A opção de resolução `square` produz um vídeo 1080x1080, útil para redes sociais.
- O formato de saída é sempre MP4 (H.264).
