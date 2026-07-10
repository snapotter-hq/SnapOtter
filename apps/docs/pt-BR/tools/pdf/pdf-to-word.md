---
description: "Converta um PDF em um documento Word (DOCX)."
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: c658777d1be0
---

# PDF to Word {#pdf-to-word}

Converta um PDF baseado em texto em um documento Word (DOCX). Mais adequado para PDFs com texto selecionável; páginas digitalizadas precisarão de OCR antes.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

Aceita dados de formulário multipart com um arquivo PDF.

## Parameters {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Envie um PDF e ele será convertido para DOCX.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

Retorna `202 Accepted`. Acompanhe o progresso via SSE em `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Formato de entrada aceito: `.pdf`.
- Funciona melhor com PDFs baseados em texto. Páginas digitalizadas ou somente de imagem produzirão saída vazia ou mínima; use o [PDF OCR](./ocr-pdf) para adicionar uma camada de texto antes.
- A conversão é feita pelo LibreOffice rodando em modo headless no servidor.
- Layouts complexos (múltiplas colunas, elementos sobrepostos) podem não ser convertidos perfeitamente.
