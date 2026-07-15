---
description: "Converta um PDF para o formato de arquivamento PDF/A-2 para preservação de longo prazo."
i18n_source_hash: 9c568a340b6f
i18n_provenance: human
i18n_output_hash: 28eef5080ad1
---

# Conversor de PDF/A {#pdf-a-convert}

Converta um PDF para o formato de arquivamento PDF/A-2, adequado para preservação de longo prazo e conformidade regulatória.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

Aceita dados de formulário multipart com um arquivo PDF. Nenhum campo `settings` é necessário.

## Parameters {#parameters}

Esta ferramenta não tem parâmetros de configuração. Envie o arquivo PDF diretamente.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notes {#notes}

- A saída está em conformidade com o padrão PDF/A-2.
- O PDF/A incorpora todas as fontes e não permite referências externas, portanto o arquivo de saída pode ser maior que o original.
- Criptografia e JavaScript são removidos durante a conversão, pois não são permitidos pelo padrão PDF/A.
