---
description: "Gere arquivos de legenda a partir das faixas de áudio de vídeos usando IA."
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: 07156969c129
---

# Auto Subtitles {#auto-subtitles}

Gere arquivos de legenda a partir da faixa de áudio de um vídeo usando reconhecimento de fala com tecnologia de IA (faster-whisper). Oferece suporte à detecção automática e a 10 idiomas explícitos.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`. Este é um endpoint assíncrono - ele retorna `202 Accepted` imediatamente e o progresso é transmitido via SSE em `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| language | string | Não | `"auto"` | Idioma da fala: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | Não | `"srt"` | Formato de legenda de saída: `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Esta é uma ferramenta de IA que requer que o pacote de recurso **transcription** esteja instalado. Se o pacote não estiver instalado, a API retorna `501 Feature Not Installed` com instruções para instalá-lo pela interface de administração.
- A opção de idioma `auto` usa a detecção de idioma integrada do whisper. Especificar o idioma explicitamente melhora a precisão e a velocidade.
- SRT é o formato de legenda com suporte mais amplo. VTT (WebVTT) é o padrão para reprodutores de vídeo web.
- Atualizações de progresso ficam disponíveis via SSE em `GET /api/v1/jobs/{jobId}/progress` até o job ser concluído.
