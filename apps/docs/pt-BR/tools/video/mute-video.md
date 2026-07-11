---
description: "Remove a faixa de áudio de um vídeo."
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: 8cb8043195b5
---

# Mute Video {#mute-video}

Remove a faixa de áudio de um vídeo, deixando apenas o stream visual.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

Aceita dados de formulário multipart com um arquivo de vídeo. Esta ferramenta não tem configurações ajustáveis.

## Parameters {#parameters}

Esta ferramenta não tem parâmetros. Ela remove a faixa de áudio do vídeo enviado.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- O stream de vídeo é copiado sem recodificação, então não há perda de qualidade.
- Se o vídeo de entrada não tiver faixa de áudio, o arquivo é retornado inalterado.
