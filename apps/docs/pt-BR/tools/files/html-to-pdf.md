---
description: "Converta um arquivo HTML para PDF."
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: 04a86204f35d
---

# HTML para PDF {#html-to-pdf}

Converta um arquivo HTML em um documento PDF estilizado. Recursos remotos (imagens, folhas de estilo e scripts externos) são desativados por privacidade.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

Aceita dados de formulário multipart com um arquivo HTML.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Envie um arquivo HTML e ele será convertido para PDF.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
```

## Exemplo de Resposta {#example-response}

Retorna `202 Accepted`. Acompanhe o progresso via SSE em `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notas {#notes}

- Formatos de entrada aceitos: `.html`, `.htm`.
- Recursos remotos (imagens, folhas de estilo e scripts referenciados por URLs) não são buscados por privacidade e segurança.
- Estilos inline e imagens incorporadas (data URIs) são preservados.
- A conversão é realizada pelo WeasyPrint no servidor.
