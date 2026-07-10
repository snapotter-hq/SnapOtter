---
description: "Converta todas as cores de um PDF para escala de cinza."
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: 597949982c22
---

# Grayscale PDF {#grayscale-pdf}

Converta todas as cores de um PDF para escala de cinza, produzindo uma versão em preto e branco do documento.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

Aceita dados de formulário multipart com um arquivo PDF. Nenhum campo `settings` é necessário.

## Parameters {#parameters}

Esta ferramenta não tem parâmetros de configuração. Envie o arquivo PDF diretamente.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Todos os espaços de cor (RGB, CMYK) são convertidos para escala de cinza, incluindo imagens incorporadas, gráficos vetoriais e texto.
- O arquivo de saída costuma ser menor que o original, pois os dados em escala de cinza exigem menos bytes por pixel.
