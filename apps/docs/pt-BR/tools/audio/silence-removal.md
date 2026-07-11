---
description: "Remove trechos de silêncio de um arquivo de áudio."
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: d785b0f332a4
---

# Remoção de Silêncio {#silence-removal}

Detecte e remova trechos de silêncio de um arquivo de áudio com base em um limiar configurável e uma duração mínima.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | Não | `-50` | Limiar de silêncio em dB (-80 a -20). Áudio abaixo desse nível é considerado silêncio. |
| minSilenceS | number | Não | `0.5` | Duração mínima de silêncio em segundos a ser removida (0,1 a 5) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Notas {#notes}

- Um limiar mais alto (menos negativo) é mais agressivo e remove tanto as passagens mais baixas quanto o silêncio real.
- Aumente `minSilenceS` para remover apenas pausas mais longas, mantendo pequenos intervalos naturais.
- Útil para limpar gravações de podcasts, palestras e mensagens de voz.
- A saída geralmente mantém o contêiner de entrada. Entradas AAC são gravadas como M4A, e entradas somente de decodificação sem suporte recorrem a MP3.
