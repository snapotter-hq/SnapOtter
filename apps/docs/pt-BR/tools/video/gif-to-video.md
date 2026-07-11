---
description: "Converte um GIF animado em um vídeo MP4, WebM ou MOV."
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: 110f0e5c0b0f
---

# GIF to Video {#gif-to-video}

Converte um GIF animado em um arquivo de vídeo MP4, WebM ou MOV compacto.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

Aceita dados de formulário multipart com um arquivo GIF e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| format | string | Não | `"mp4"` | Formato de saída: `mp4`, `webm`, `mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- Converter GIF para vídeo normalmente reduz o tamanho do arquivo em 80-90% mantendo a mesma qualidade visual.
- Apenas arquivos GIF animados são aceitos. Imagens estáticas devem usar a ferramenta Convert de imagem.
- MP4 e MOV usam codificação H.264, WebM usa VP9.
