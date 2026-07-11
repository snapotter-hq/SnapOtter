---
description: "Acelere ou desacelere a reprodução de áudio com um multiplicador."
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: c21761c335f8
---

# Velocidade de Áudio {#audio-speed}

Acelere ou desacelere a reprodução de áudio aplicando um multiplicador de velocidade.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| factor | number | Não | `1.5` | Multiplicador de velocidade (0,25 a 4). Valores abaixo de 1 desaceleram; acima de 1 aceleram. |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## Notas {#notes}

- Um fator de `0.25` reproduz em um quarto da velocidade (4x mais longo). Um fator de `4` reproduz em velocidade quádrupla (4x mais curto).
- O tom é preservado enquanto a velocidade muda (time-stretch). Use o pitch-shift para ajustar o tom de forma independente.
- A saída normalmente mantém o contêiner de entrada. Entrada AAC é gravada como M4A, e entradas apenas de decodificação não suportadas recorrem a MP3.
