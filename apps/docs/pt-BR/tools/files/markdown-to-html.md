---
description: "Converta um arquivo Markdown em uma página HTML independente."
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: d44985ffda3e
---

# Markdown para HTML {#markdown-to-html}

Converta um arquivo Markdown em uma página HTML independente. Imagens remotas referenciadas na fonte permanecem inalteradas na saída.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

Aceita dados de formulário multipart com um arquivo Markdown.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Envie um arquivo Markdown e ele será convertido para HTML.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Notas {#notes}

- Formatos de entrada aceitos: `.md`, `.markdown`.
- Esta é uma ferramenta rápida (síncrona) que retorna o resultado diretamente.
- A saída é uma página HTML autocontida, com estilos inline.
- URLs de imagens remotas na fonte Markdown são preservadas inalteradas e não são buscadas.
