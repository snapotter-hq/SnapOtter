---
description: "Converta um arquivo Markdown em um PDF estilizado."
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: 88367614b0e2
---

# Markdown para PDF {#markdown-to-pdf}

Converta um arquivo Markdown em um documento PDF estilizado. Os recursos remotos ficam desativados por privacidade.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

Aceita dados de formulário multipart com um arquivo Markdown.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Envie um arquivo Markdown e ele será convertido em PDF.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
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

- Formatos de entrada aceitos: `.md`, `.markdown`.
- Recursos remotos (imagens, folhas de estilo referenciadas por URLs) não são buscados, por privacidade e segurança.
- O Markdown é primeiro renderizado em HTML e depois convertido em PDF via WeasyPrint.
- Blocos de código, tabelas e outros elementos Markdown são estilizados na saída em PDF.
