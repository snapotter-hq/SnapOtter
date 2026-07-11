---
description: "Substitui a faixa de áudio de um vídeo por outro arquivo."
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: ef52405af2b3
---

# Replace Audio {#replace-audio}

Substitui a faixa de áudio de um vídeo por um arquivo de áudio. Envie tanto um vídeo quanto um arquivo de áudio.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

Aceita dados de formulário multipart com exatamente dois arquivos: um arquivo de vídeo seguido de um arquivo de áudio.

## Parameters {#parameters}

Esta ferramenta não tem parâmetros de configuração. Envie um arquivo de vídeo e um arquivo de áudio como duas partes `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- Exatamente dois arquivos devem ser enviados: o primeiro deve ser um vídeo, o segundo deve ser um arquivo de áudio.
- Se o arquivo de áudio for mais longo que o vídeo, ele é cortado para corresponder à duração do vídeo. Se for mais curto, o vídeo restante é reproduzido em silêncio.
- O stream de vídeo é copiado sem recodificação, então não há perda de qualidade de vídeo.
