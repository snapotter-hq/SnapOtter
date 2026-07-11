---
description: "Extraia texto simples de um PDF."
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: cd7140a98b01
---

# PDF to Text {#pdf-to-text}

Extraia todo o texto simples legível de um documento PDF para um arquivo de texto.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

Aceita dados de formulário multipart com um arquivo PDF.

## Parameters {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Envie um PDF e seu conteúdo de texto será extraído.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notes {#notes}

- Formato de entrada aceito: `.pdf`.
- Esta é uma ferramenta rápida (síncrona) que retorna o resultado diretamente.
- O campo `chars` na resposta indica o número de caracteres extraídos.
- Apenas o texto incorporado digitalmente é extraído. Para documentos digitalizados ou PDFs baseados em imagem, use a ferramenta [PDF OCR](./ocr-pdf).
