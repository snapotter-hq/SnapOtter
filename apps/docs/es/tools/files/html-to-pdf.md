---
description: "Convierte un archivo HTML a PDF."
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: 982e3551cd77
---

# HTML a PDF {#html-to-pdf}

Convierte un archivo HTML en un documento PDF con estilos. Los recursos remotos (imágenes, hojas de estilo y scripts externos) están deshabilitados por privacidad.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

Acepta datos de formulario multipart con un archivo HTML.

## Parámetros {#parameters}

Esta herramienta no tiene parámetros configurables. Sube un archivo HTML y se convertirá a PDF.

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
```

## Ejemplo de respuesta {#example-response}

Devuelve `202 Accepted`. Sigue el progreso mediante SSE en `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notas {#notes}

- Formatos de entrada aceptados: `.html`, `.htm`.
- Los recursos remotos (imágenes, hojas de estilo y scripts referenciados mediante URL) no se descargan por privacidad y seguridad.
- Los estilos en línea y las imágenes incrustadas (data URI) se conservan.
- La conversión la gestiona WeasyPrint en el servidor.
