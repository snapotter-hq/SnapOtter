---
description: "Une vários clipes de vídeo em um único arquivo."
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: dc97ef747e01
---

# Merge Videos {#merge-videos}

Une vários clipes de vídeo em um único arquivo MP4. Todas as entradas são normalizadas para a resolução do primeiro vídeo e 30 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

Aceita dados de formulário multipart com dois ou mais arquivos de vídeo. Este é um endpoint assíncrono - ele retorna `202 Accepted` imediatamente e o progresso é transmitido via SSE em `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

Esta ferramenta não tem parâmetros de configuração. Envie 2-10 arquivos de vídeo como várias partes `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Os clipes são concatenados na ordem em que são enviados.
- Todos os clipes são recodificados para corresponder à resolução, taxa de quadros (30 fps) e codec (H.264) do primeiro clipe. Entradas incompatíveis são normalizadas automaticamente.
- Aceita 2-10 arquivos de vídeo por requisição.
- As atualizações de progresso ficam disponíveis via SSE em `GET /api/v1/jobs/{jobId}/progress` até que o job seja concluído.
