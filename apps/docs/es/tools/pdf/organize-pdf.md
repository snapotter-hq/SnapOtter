---
description: "Reordena las páginas de un PDF con un orden de páginas explícito."
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: d8a167869ddb
---

# Organizar PDF {#organize-pdf}

Reordena las páginas de un PDF especificando la secuencia de páginas deseada.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| order | string | Sí | - | Orden de páginas deseado en sintaxis qpdf, p. ej. `"3,1,2,5-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Los rangos de páginas usan la sintaxis de qpdf: `3,1,2` reordena las tres primeras páginas y `5-z` añade las páginas 5 hasta la última.
- Las páginas se pueden duplicar enumerándolas más de una vez (p. ej. `"1,1,2,3"` duplica la página 1).
- Las páginas no incluidas en la cadena de orden se omiten de la salida.
