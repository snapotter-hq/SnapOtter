---
description: "Converta apresentações em PDF."
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: 479ac15b53a7
---

# PowerPoint para PDF {#powerpoint-to-pdf}

Converta apresentações do PowerPoint ou OpenDocument em PDF, com um slide por página.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

Aceita dados de formulário multipart com um arquivo PowerPoint/ODP.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Envie uma apresentação e ela será convertida em PDF.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
```

## Exemplo de Resposta {#example-response}

Retorna `202 Accepted`. Acompanhe o progresso via SSE em `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Observações {#notes}

- Formatos de entrada aceitos: `.pptx`, `.ppt`, `.odp`.
- Cada slide se torna uma página no PDF.
- A conversão é feita pelo LibreOffice em modo headless no servidor.
- Animações e transições não são incluídas na saída em PDF.
