---
description: "Converta fala em texto com transcrição por IA."
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: 5d605f2aff6c
---

# Transcrever Áudio {#transcribe-audio}

Converta fala em texto usando transcrição por IA (faster-whisper). Suporta os formatos de saída texto simples, SRT e VTT, com seleção de idioma automática ou manual.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| language | string | Não | `"auto"` | Idioma: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | Não | `"txt"` | Formato de saída: `txt`, `srt`, `vtt` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Exemplo de Resposta {#example-response}

Esta é uma ferramenta assíncrona. A API retorna `202 Accepted` imediatamente:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Acompanhe o progresso via SSE em `GET /api/v1/jobs/{jobId}/progress`. Quando o job é concluído, o fluxo SSE entrega o resultado final com um `downloadUrl`.

## Notas {#notes}

- Requer que o pacote de recursos **transcription** esteja instalado. Retorna `501` com o código `FEATURE_NOT_INSTALLED`, o `feature` ausente, `featureName` e `estimatedSize` se o pacote não estiver disponível.
- Usa faster-whisper para a transcrição. O idioma `auto` detecta o idioma falado automaticamente.
- Os formatos `srt` e `vtt` incluem marcações de tempo para cada segmento, adequados para legendas.
- O formato `txt` retorna texto simples sem marcações de tempo.
- Esta é uma ferramenta de IA de longa duração; o tempo de processamento depende da duração do áudio e do hardware do servidor.
