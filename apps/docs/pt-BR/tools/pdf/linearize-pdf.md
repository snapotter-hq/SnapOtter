---
description: "Linearize um PDF para visualização web rápida (download progressivo)."
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: 780ddb2b9093
---

# Web-Optimize PDF {#web-optimize-pdf}

Linearize um PDF para que ele possa ser baixado e exibido progressivamente em navegadores web sem esperar pelo arquivo completo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

Aceita dados de formulário multipart com um arquivo PDF. Nenhum campo `settings` é necessário.

## Parameters {#parameters}

Esta ferramenta não tem parâmetros de configuração. Envie o arquivo PDF diretamente.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- A linearização reorganiza a estrutura interna do PDF para que a primeira página possa ser renderizada antes de o arquivo completo ser baixado.
- O arquivo de saída pode ficar ligeiramente maior que a entrada devido aos dados de linearização adicionados.
- PDFs já linearizados são relinearizados sem problemas.
