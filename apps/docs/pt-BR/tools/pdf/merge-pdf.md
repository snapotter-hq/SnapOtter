---
description: "Combine vários PDFs em um único documento."
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: b587bdc028a3
---

# Merge PDFs {#merge-pdfs}

Combine dois ou mais arquivos PDF em um único documento, preservando a ordem das páginas de cada arquivo de entrada.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

Aceita dados de formulário multipart com dois ou mais arquivos PDF. Nenhum campo `settings` é necessário.

## Parameters {#parameters}

Esta ferramenta não tem parâmetros de configuração. Basta enviar dois ou mais arquivos PDF.

| Restrição | Valor |
|------------|-------|
| Mínimo de arquivos | 2 |
| Máximo de arquivos | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Os arquivos são combinados na ordem em que são enviados.
- São necessários pelo menos dois arquivos PDF; a requisição falhará com um erro 400 se forem fornecidos menos.
- O número máximo de arquivos de entrada é 20.
- PDFs criptografados devem ser desbloqueados antes de mesclar.
