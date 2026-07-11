---
description: "Converta arquivos Word, Markdown, HTML ou texto simples em EPUB."
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: 23334a058404
---

# Converter para EPUB {#convert-to-epub}

Converta documentos do Word, Markdown, HTML ou arquivos de texto simples no formato de e-book EPUB.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

Aceita dados de formulário multipart com um arquivo Word/Markdown/HTML/TXT.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Envie um documento e ele será convertido em EPUB.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
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

- Formatos de entrada aceitos: `.docx`, `.md`, `.html`, `.txt`.
- A saída EPUB segue a especificação EPUB 3.
- Os títulos no documento de origem são usados para gerar o sumário.
- A conversão é feita pelo Pandoc no servidor.
