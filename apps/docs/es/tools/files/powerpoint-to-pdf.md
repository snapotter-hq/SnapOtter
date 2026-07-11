---
description: "Convierte presentaciones a PDF."
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: 2d2670bdbf25
---

# PowerPoint a PDF {#powerpoint-to-pdf}

Convierte presentaciones de PowerPoint u OpenDocument a PDF, con una diapositiva por página.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

Acepta datos de formulario multipart con un archivo PowerPoint/ODP.

## Parameters {#parameters}

Esta herramienta no tiene parámetros configurables. Sube una presentación y se convertirá a PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
```

## Example Response {#example-response}

Devuelve `202 Accepted`. Sigue el progreso mediante SSE en `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Formatos de entrada aceptados: `.pptx`, `.ppt`, `.odp`.
- Cada diapositiva se convierte en una página del PDF.
- La conversión la realiza LibreOffice ejecutándose en modo headless en el servidor.
- Las animaciones y transiciones no se incluyen en la salida PDF.
