---
description: "Convierte archivos de Word, Markdown, HTML o texto plano a EPUB."
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: 93aa79fef45f
---

# Convertir a EPUB {#convert-to-epub}

Convierte documentos de Word, Markdown, HTML o archivos de texto plano al formato de libro electrónico EPUB.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

Acepta datos de formulario multipart con un archivo Word/Markdown/HTML/TXT.

## Parameters {#parameters}

Esta herramienta no tiene parámetros configurables. Sube un documento y se convertirá a EPUB.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
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

- Formatos de entrada aceptados: `.docx`, `.md`, `.html`, `.txt`.
- La salida EPUB sigue la especificación EPUB 3.
- Los encabezados del documento de origen se usan para generar la tabla de contenidos.
- La conversión la realiza Pandoc en el servidor.
