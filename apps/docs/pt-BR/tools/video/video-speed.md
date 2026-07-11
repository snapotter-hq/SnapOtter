---
description: "Acelera ou desacelera um vídeo."
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: 192dac2ca053
---

# Video Speed {#video-speed}

Acelera ou desacelera um vídeo com uma opção para preservar o tom do áudio.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| factor | number | Não | `2` | Multiplicador de velocidade (0.25-4). Valores acima de 1 aceleram, abaixo de 1 desaceleram |
| keepPitch | boolean | Não | `true` | Preserva o tom do áudio ao alterar a velocidade |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- Um fator de `2` dobra a velocidade de reprodução (reduz a duração pela metade). Um fator de `0.5` reduz a velocidade de reprodução pela metade (dobra a duração).
- Quando `keepPitch` é `true`, o áudio é esticado no tempo para que as vozes soem naturais. Quando `false`, o tom muda proporcionalmente com a velocidade.
- A faixa válida é de 0.25x a 4x.
