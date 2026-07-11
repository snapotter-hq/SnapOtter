---
description: "Incorpore formulários e anotações ao conteúdo da página."
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: 55bbc26b338a
---

# Flatten PDF {#flatten-pdf}

Incorpore campos de formulário interativos e anotações ao conteúdo da página, produzindo um PDF estático que fica igual em qualquer lugar.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

Aceita dados de formulário multipart com um arquivo PDF.

## Parameters {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Envie um PDF e todos os formulários e anotações serão achatados.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Notes {#notes}

- Formato de entrada aceito: `.pdf`.
- Esta é uma ferramenta rápida (síncrona) que retorna o resultado diretamente.
- Os valores dos campos de formulário são preservados como texto estático na saída.
- As anotações (comentários, destaques, notas adesivas) passam a fazer parte do conteúdo da página e não podem mais ser editadas.
