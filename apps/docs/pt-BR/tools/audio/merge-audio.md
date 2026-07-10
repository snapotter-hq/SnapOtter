---
description: "Combine vários arquivos de áudio em uma única trilha sequencial."
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: 9280308bc318
---

# Mesclar Áudio {#merge-audio}

Combine dois ou mais arquivos de áudio em uma única trilha sequencial, concatenados na ordem em que são enviados.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

Aceita dados de formulário multipart com vários arquivos de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| format | string | Não | `"mp3"` | Formato de saída: `mp3`, `wav`, `flac`, `m4a` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## Notas {#notes}

- Aceita de 2 a 10 arquivos de áudio por requisição.
- Os arquivos são concatenados na ordem de envio.
- Todos os arquivos de entrada são recodificados para o formato de saída e a taxa de amostragem escolhidos, garantindo uma junção sem emendas.
- Formatos de entrada mistos são suportados (por exemplo, um WAV e um MP3).
