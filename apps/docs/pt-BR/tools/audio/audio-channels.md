---
description: "Converta entre mono e estéreo ou troque os canais esquerdo e direito."
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: 6fc0f7249359
---

# Canais de Áudio {#audio-channels}

Converta áudio entre layouts mono e estéreo, ou troque os canais esquerdo e direito de um arquivo estéreo.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| mode | string | Sim | - | Operação de canal: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## Notas {#notes}

- `stereo-to-mono` mistura os dois canais em uma única trilha mono.
- `mono-to-stereo` duplica o canal mono para os canais esquerdo e direito.
- `swap` troca os canais esquerdo e direito de um arquivo estéreo.
- A saída normalmente mantém o contêiner de entrada. Entrada AAC é gravada como M4A, e entradas apenas de decodificação não suportadas recorrem a MP3.
