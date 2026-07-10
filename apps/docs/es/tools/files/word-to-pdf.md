---
description: "Convierte documentos de Word a PDF."
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: eca87d500470
---

# Word a PDF {#word-to-pdf}

Convierte documentos de Word, texto OpenDocument, RTF o archivos de texto plano a PDF.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

Acepta datos de formulario multipart con un archivo Word/ODT/RTF/TXT.

## Parameters {#parameters}

Esta herramienta no tiene parámetros configurables. Sube un documento y se convertirá a PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
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

- Formatos de entrada aceptados: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- La conversión la realiza LibreOffice ejecutándose en modo headless en el servidor.
- Se usan las fuentes incrustadas en el documento cuando están disponibles; de lo contrario, se sustituyen por fuentes del sistema.
- Los encabezados, pies de página, tablas e imágenes se conservan en la salida PDF.
