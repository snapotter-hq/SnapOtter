---
description: "Crie um trecho de toque de celular a partir de qualquer arquivo de áudio."
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: 56e213e325f0
---

# Criador de Toque {#ringtone-maker}

Crie um trecho de toque de celular (.m4r) a partir de qualquer arquivo de áudio, selecionando um tempo inicial e uma duração.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| startS | number | Não | `0` | Tempo inicial em segundos (mínimo 0) |
| durationS | number | Não | `30` | Duração do trecho em segundos (1 a 30) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## Notas {#notes}

- A saída é sempre no formato M4R, compatível com toques do iPhone.
- A duração máxima do toque é de 30 segundos (limite da Apple).
- Qualquer formato de áudio pode ser usado como entrada.
