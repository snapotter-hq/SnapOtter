---
description: "Extrai a faixa de legenda de um vídeo como um arquivo SRT."
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: 3bbcc61710ae
---

# Extract Subtitles {#extract-subtitles}

Extrai a faixa de legenda embutida de um contêiner de vídeo e a baixa como um arquivo SRT.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Aceita dados de formulário multipart com um arquivo de vídeo. Esta ferramenta não tem configurações ajustáveis.

## Parameters {#parameters}

Esta ferramenta não tem parâmetros. Ela extrai a primeira faixa de legenda encontrada no contêiner do vídeo.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- O vídeo deve conter uma faixa de legenda embutida. Se nenhuma faixa de legenda for encontrada, a requisição retorna um erro 400.
- Se o vídeo tiver várias faixas de legenda, a primeira é extraída.
- O formato de saída é SRT, independentemente do formato original da legenda no contêiner.
