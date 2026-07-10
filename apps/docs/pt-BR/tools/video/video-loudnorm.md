---
description: "Normaliza o volume do áudio do vídeo para o padrão de broadcast."
i18n_source_hash: 078f1e819c9a
i18n_provenance: human
i18n_output_hash: ae3de30eeee0
---

# Normalize Audio {#normalize-audio}

Normaliza o volume do áudio do vídeo para o padrão de loudness de broadcast EBU R128.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

Aceita dados de formulário multipart com um arquivo de vídeo. Esta ferramenta não tem configurações ajustáveis.

## Parameters {#parameters}

Esta ferramenta não tem parâmetros. Ela aplica a normalização de loudness EBU R128 à faixa de áudio.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- Usa o filtro `loudnorm` do FFmpeg, com alvo de -16 LUFS de loudness integrado, -1.5 dBTP de pico verdadeiro e 11 LU de faixa de loudness (padrão de broadcast EBU R128).
- A taxa de amostragem do áudio de origem é preservada na saída.
- Se o vídeo não tiver faixa de áudio, a requisição retorna um erro 400.
