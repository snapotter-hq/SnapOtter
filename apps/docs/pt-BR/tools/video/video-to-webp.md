---
description: "Converte um clipe de vídeo em uma imagem WebP animada."
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: 275276831ce5
---

# Video to WebP {#video-to-webp}

Converte um clipe de vídeo em uma imagem WebP animada com taxa de quadros, largura e qualidade configuráveis.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| fps | integer | Não | `12` | Taxa de quadros de saída (1-30) |
| width | integer | Não | `480` | Largura de saída em pixels (16-1920). A altura é escalada proporcionalmente |
| quality | integer | Não | `75` | Qualidade de compressão WebP (1-100) |
| loop | boolean | Não | `true` | Repete a animação em loop |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- O WebP animado produz arquivos menores que o GIF com melhor suporte a cores (paleta de 24 bits vs 8 bits).
- Valores mais baixos de `quality` produzem arquivos menores à custa da fidelidade visual.
- Defina `loop` como `false` para animações que devem ser reproduzidas uma vez e parar.
