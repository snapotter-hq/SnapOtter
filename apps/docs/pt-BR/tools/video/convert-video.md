---
description: "Converte vídeos entre MP4, MOV, WebM, AVI e MKV."
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: 54711fa81e52
---

# Convert Video {#convert-video}

Converte vídeos entre os formatos MP4, MOV, WebM, AVI e MKV com presets de qualidade configuráveis.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`. Este é um endpoint assíncrono - ele retorna `202 Accepted` imediatamente e o progresso é transmitido via SSE em `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| format | string | Não | `"mp4"` | Formato de saída: `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | Não | `"balanced"` | Preset de qualidade: `high`, `balanced`, `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- O preset de qualidade `high` produz a melhor fidelidade visual, mas arquivos maiores. O preset `small` comprime de forma agressiva para o menor tamanho de arquivo.
- A saída WebM usa codificação VP9. MP4 e MOV usam H.264. AVI e MKV estão disponíveis para fluxos de trabalho legados ou de arquivamento.
- As atualizações de progresso ficam disponíveis via SSE em `GET /api/v1/jobs/{jobId}/progress` até que o job seja concluído.
