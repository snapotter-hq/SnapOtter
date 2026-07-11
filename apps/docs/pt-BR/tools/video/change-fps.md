---
description: "Altera a taxa de quadros de um vídeo."
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: 960affca6cb3
---

# Change FPS {#change-fps}

Altera a taxa de quadros de um vídeo para um valor de destino entre 1 e 120 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| fps | number | Não | `30` | Taxa de quadros de destino (1-120) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- Reduzir a taxa de quadros descarta quadros e diminui o tamanho do arquivo. Aumentá-la duplica quadros para preencher a lacuna, mas não adiciona detalhes reais de movimento.
- Valores de destino comuns: 24 (cinema), 30 (web/broadcast), 60 (reprodução suave).
- A faixa de áudio é preservada na sua taxa de amostragem original.
