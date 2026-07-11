---
description: "Exclua páginas específicas de um PDF."
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: 68675a4547b3
---

# Remove Pages {#remove-pages}

Exclua páginas específicas de um PDF, mantendo todas as páginas restantes intactas.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| pages | string | Sim | - | Intervalo de páginas a remover na sintaxe qpdf, por exemplo `"3,5-7"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- Você não pode remover todas as páginas de um documento; pelo menos uma página deve permanecer.
- Os intervalos de páginas usam a sintaxe qpdf: `3` para uma única página, `5-7` para um intervalo, e vírgulas para combinar (por exemplo `1,3,5-7`).
