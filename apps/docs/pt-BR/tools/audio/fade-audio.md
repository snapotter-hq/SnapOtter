---
description: "Adicione efeitos de fade-in e fade-out ao áudio."
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: eb9278a32735
---

# Fade de Áudio {#fade-audio}

Adicione efeitos de fade-in e fade-out ao início e ao fim de um arquivo de áudio.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| fadeInS | number | Não | `1` | Duração do fade-in em segundos (0 a 30) |
| fadeOutS | number | Não | `1` | Duração do fade-out em segundos (0 a 30) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notas {#notes}

- Defina qualquer um dos valores como `0` para pular aquela direção de fade. Pelo menos um deles precisa ser maior que 0.
- A duração do fade é limitada ao comprimento do áudio se ultrapassá-lo.
- A saída normalmente mantém o contêiner de entrada. Entrada AAC é gravada como M4A, e entradas apenas de decodificação não suportadas recorrem a MP3.
