---
description: "Recorte um trecho de um arquivo de áudio informando os tempos de início e fim."
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: 863979175091
i18n_hash_version: 2
---

# Recortar Áudio {#trim-audio}

Recorte um trecho de um arquivo de áudio. Você pode manter a parte entre um tempo de início e um de fim, ou remover uma quantidade fixa do começo e do fim.

No app, os campos de tempo aceitam segundos simples (`90`), `MM:SS` (`1:30`) ou `HH:MM:SS` (`1:02:03.5`). A API recebe segundos.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| mode | string | Não | `range` | `range` mantém de `startS` até `endS`. `ends` remove `cutStartS` do começo e `cutEndS` do fim |
| startS | number | Não | `0` | Modo range: tempo de início em segundos (mínimo 0) |
| endS | number | Modo range | - | Modo range: tempo de fim em segundos (deve ser posterior ao início) |
| cutStartS | number | Não | `0` | Modo ends: segundos a remover do começo |
| cutEndS | number | Não | `0` | Modo ends: segundos a remover do fim |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

Remover os 2 primeiros segundos e os 3 últimos, qualquer que seja a duração do arquivo:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
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
- No modo range, `endS` deve ser maior que `startS`. Se `endS` exceder a duração do áudio, o arquivo é recortado até o fim.
- No modo ends, pelo menos um entre `cutStartS` e `cutEndS` deve ser maior que zero, e juntos devem deixar pelo menos 0,1 segundo de áudio. Como o corte é medido a partir da duração de cada arquivo, uma única configuração funciona em um lote de arquivos com durações diferentes.
- A saída geralmente mantém o contêiner de entrada. Entradas AAC são gravadas como M4A, e entradas somente de decodificação sem suporte recorrem a MP3.
