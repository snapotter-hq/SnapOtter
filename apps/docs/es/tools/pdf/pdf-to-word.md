---
description: "Convierte un PDF en un documento de Word (DOCX)."
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: 71653210a6c5
---

# PDF a Word {#pdf-to-word}

Convierte un PDF basado en texto en un documento de Word (DOCX). Ideal para PDF con texto seleccionable; las páginas escaneadas necesitarán OCR primero.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

Acepta datos de formulario multipart con un archivo PDF.

## Parameters {#parameters}

Esta herramienta no tiene parámetros configurables. Sube un PDF y se convertirá a DOCX.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
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

- Formato de entrada aceptado: `.pdf`.
- Funciona mejor con PDF basados en texto. Las páginas escaneadas o solo de imagen producirán una salida vacía o mínima; usa [OCR de PDF](./ocr-pdf) para añadir primero una capa de texto.
- La conversión la gestiona LibreOffice ejecutándose sin interfaz gráfica en el servidor.
- Los diseños complejos (varias columnas, elementos superpuestos) pueden no convertirse a la perfección.
