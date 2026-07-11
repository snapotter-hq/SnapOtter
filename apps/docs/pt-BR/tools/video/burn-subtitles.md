---
description: "Renderiza legendas permanentemente nos quadros do vídeo."
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: 4227ae56ec6f
---

# Burn Subtitles {#burn-subtitles}

Renderiza permanentemente (embute) legendas de um arquivo SRT, VTT ou ASS em cada quadro de um vídeo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

Aceita dados de formulário multipart com um arquivo de vídeo e um arquivo de legenda. Este é um endpoint assíncrono - ele retorna `202 Accepted` imediatamente e o progresso é transmitido via SSE em `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| fontSize | integer | Não | `24` | Tamanho da fonte da legenda em pixels (8-72) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Envie dois arquivos: o primeiro deve ser um vídeo, o segundo deve ser um arquivo de legenda (.srt, .vtt ou .ass).
- As legendas embutidas passam a fazer parte permanente do vídeo e não podem ser desativadas pelo espectador. Para legendas que podem ser ativadas e desativadas, use a ferramenta Embed Subtitles.
- As atualizações de progresso ficam disponíveis via SSE em `GET /api/v1/jobs/{jobId}/progress` até que o job seja concluído.
