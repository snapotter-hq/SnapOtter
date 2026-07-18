---
description: "Converta áudio entre os formatos MP3, WAV, OGG, FLAC e M4A."
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: 0a8a44ccc8ef
---

# Converter Áudio {#convert-audio}

Converta arquivos de áudio entre formatos comuns, incluindo MP3, WAV, OGG, FLAC e M4A, com bitrate de saída e taxa de amostragem configuráveis.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| format | string | Não | `"mp3"` | Formato de saída: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Não | `192` | Bitrate de saída em kbps (32 a 320) |
| sampleRate | integer | Não | taxa original | Taxa de amostragem de saída em Hz: `8000`, `16000`, `22050`, `32000`, `44100`, `48000` ou `96000`. Omita para manter a taxa original |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## Notas {#notes}

- Os formatos de entrada suportados incluem MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF e OPUS.
- O bitrate só se aplica a formatos com perda (MP3, OGG, M4A). Formatos sem perda como WAV e FLAC ignoram essa configuração.
- A saída em MP3 suporta taxas de amostragem de até 48000 Hz. A opção de 96000 Hz só se aplica a WAV, OGG, FLAC e M4A.
- O bitrate do MP3 é limitado pela taxa de amostragem: no máximo 64 kbps a 8000 Hz e 160 kbps a 16000 ou 22050 Hz. Requisições acima do limite são rejeitadas em vez de serem reduzidas silenciosamente.
- O nome do arquivo de saída mantém o nome original com a nova extensão.
