---
description: "Tente reparar um PDF danificado ou corrompido."
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: e40d1d840755
---

# Repair PDF {#repair-pdf}

Tente reparar um PDF danificado ou corrompido reconstruindo sua estrutura interna.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

Aceita dados de formulário multipart com um arquivo PDF. Nenhum campo `settings` é necessário.

## Parameters {#parameters}

Esta ferramenta não tem parâmetros de configuração. Envie o arquivo PDF danificado diretamente.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- A validação estrutural é ignorada na entrada para permitir a passagem de arquivos malformados.
- O reparo é feito na medida do possível; arquivos gravemente corrompidos podem não ser totalmente recuperáveis.
- O PDF reparado pode ter tamanho ligeiramente diferente do original devido às tabelas de referência cruzada reconstruídas.
