---
description: "Recorte um trecho de um arquivo de áudio informando os tempos de início e fim."
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: 25e53e62c92f
---

# Recortar Áudio {#trim-audio}

Recorte um trecho de um arquivo de áudio informando os tempos de início e fim em segundos.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| startS | number | Não | `0` | Tempo de início em segundos (mínimo 0) |
| endS | number | Sim | - | Tempo de fim em segundos (deve ser posterior ao início) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notas {#notes}

- Os tempos são informados em segundos e podem incluir decimais (ex.: `10.5`).
- O valor de `endS` deve ser maior que `startS`.
- Se `endS` exceder a duração do áudio, o arquivo é recortado até o fim.
- A saída geralmente mantém o contêiner de entrada. Entradas AAC são gravadas como M4A, e entradas somente de decodificação sem suporte recorrem a MP3.
