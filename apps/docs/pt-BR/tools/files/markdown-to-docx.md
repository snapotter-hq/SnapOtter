---
description: "Converta um arquivo Markdown em um documento Word (DOCX)."
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: f4b965441a55
---

# Markdown para Word {#markdown-to-word}

Converta um arquivo Markdown em um documento Word (DOCX), preservando títulos, listas, blocos de código e outras formatações.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

Aceita dados de formulário multipart com um arquivo Markdown.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Envie um arquivo Markdown e ele será convertido para DOCX.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Notas {#notes}

- Formatos de entrada aceitos: `.md`, `.markdown`.
- Esta é uma ferramenta rápida (síncrona) que retorna o resultado diretamente.
- Títulos, negrito, itálico, links, blocos de código e listas são mapeados para estilos do Word.
- A conversão é realizada pelo Pandoc no servidor.
