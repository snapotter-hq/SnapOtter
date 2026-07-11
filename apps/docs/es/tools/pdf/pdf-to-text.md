---
description: "Extrae texto sin formato de un PDF."
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: 89988dd528d7
---

# PDF a texto {#pdf-to-text}

Extrae todo el texto legible sin formato de un documento PDF a un archivo de texto.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

Acepta datos de formulario multipart con un archivo PDF.

## Parameters {#parameters}

Esta herramienta no tiene parámetros configurables. Sube un PDF y se extraerá su contenido de texto.

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

- Formato de entrada aceptado: `.pdf`.
- Esta es una herramienta rápida (síncrona) que devuelve el resultado directamente.
- El campo `chars` de la respuesta indica el número de caracteres extraídos.
- Solo se extrae el texto incrustado digitalmente. Para documentos escaneados o PDF basados en imágenes, usa la herramienta [OCR de PDF](./ocr-pdf) en su lugar.
