---
description: "Reordene páginas em um PDF com uma ordem de páginas explícita."
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: 09c57987f23b
---

# Organize PDF {#organize-pdf}

Reordene páginas em um PDF especificando a sequência de páginas desejada.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| order | string | Sim | - | Ordem de páginas desejada na sintaxe qpdf, por exemplo `"3,1,2,5-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Os intervalos de páginas usam a sintaxe qpdf: `3,1,2` reordena as três primeiras páginas, e `5-z` acrescenta as páginas 5 até a última.
- As páginas podem ser duplicadas listando-as mais de uma vez (por exemplo `"1,1,2,3"` duplica a página 1).
- As páginas não listadas na string de ordem são omitidas da saída.
