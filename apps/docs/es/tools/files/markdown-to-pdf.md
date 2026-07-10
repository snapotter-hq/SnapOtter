---
description: "Convierte un archivo Markdown en un PDF con estilos."
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: 10deb21c3fb7
---

# Markdown a PDF {#markdown-to-pdf}

Convierte un archivo Markdown en un documento PDF con estilos. Los recursos remotos están deshabilitados por privacidad.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

Acepta datos de formulario multipart con un archivo Markdown.

## Parameters {#parameters}

Esta herramienta no tiene parámetros configurables. Sube un archivo Markdown y se convertirá a PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
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

- Formatos de entrada aceptados: `.md`, `.markdown`.
- Los recursos remotos (imágenes, hojas de estilo referenciadas mediante URL) no se descargan por privacidad y seguridad.
- El Markdown se renderiza primero a HTML y luego se convierte a PDF mediante WeasyPrint.
- Los bloques de código, las tablas y otros elementos de Markdown reciben estilos en la salida PDF.
