---
description: "Extrai a trilha de legendas de um vídeo como um arquivo SRT, WebVTT ou ASS."
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: cbb3c5ba48de
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

Extrai a faixa de legenda embutida de um contêiner de vídeo e a baixa como um arquivo SRT, WebVTT ou ASS.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Aceita dados de formulário multipart com um arquivo de vídeo e uma string JSON `settings` opcional.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | Formato de saída: `srt`, `vtt` (WebVTT) ou `ass` |

A primeira faixa de legenda encontrada no contêiner do vídeo é extraída.

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

- O vídeo deve conter uma faixa de legenda embutida. Se nenhuma faixa de legenda for encontrada, a requisição retorna um erro 400.
- Se o vídeo tiver várias faixas de legenda, a primeira é extraída.
- Faixas de texto (SubRip, ASS, mov_text, WebVTT) podem ser convertidas para qualquer um dos três formatos de saída. Converter uma faixa ASS para SRT ou WebVTT descarta seu posicionamento e seus efeitos.
- Faixas baseadas em imagem (Blu-ray PGS, DVD VobSub) não podem virar texto sem OCR e retornam um erro 422.
