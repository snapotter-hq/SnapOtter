---
description: "Incorpora formularios y anotaciones al contenido de la página."
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: 4956584cd062
---

# Aplanar PDF {#flatten-pdf}

Incorpora los campos de formulario interactivos y las anotaciones al contenido de la página, produciendo un PDF estático que se ve igual en todas partes.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

Acepta datos de formulario multipart con un archivo PDF.

## Parameters {#parameters}

Esta herramienta no tiene parámetros configurables. Sube un PDF y todos los formularios y anotaciones se aplanarán.

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

- Formato de entrada aceptado: `.pdf`.
- Esta es una herramienta rápida (síncrona) que devuelve el resultado directamente.
- Los valores de los campos de formulario se conservan como texto estático en la salida.
- Las anotaciones (comentarios, resaltados, notas adhesivas) pasan a formar parte del contenido de la página y ya no se pueden editar.
