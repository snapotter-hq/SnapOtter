---
description: "Reproduz um clipe de vídeo de trás para frente."
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: 0798564a0e78
---

# Reverse Video {#reverse-video}

Reproduz um clipe de vídeo de trás para frente. A faixa de áudio também é invertida.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

Aceita dados de formulário multipart com um arquivo de vídeo. Esta ferramenta não tem configurações ajustáveis.

## Parameters {#parameters}

Esta ferramenta não tem parâmetros. Ela inverte o vídeo inteiro.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes {#notes}

- Limitado a clipes de até 5 minutos de duração. Vídeos mais longos são rejeitados com um erro 400.
- Tanto as faixas de vídeo quanto de áudio são invertidas. Para inverter o vídeo sem áudio, mute-o primeiro.
