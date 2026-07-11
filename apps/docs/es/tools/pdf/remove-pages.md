---
description: "Elimina páginas específicas de un PDF."
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: 02e4c8b71d7a
---

# Eliminar páginas {#remove-pages}

Elimina páginas específicas de un PDF, manteniendo intactas todas las páginas restantes.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| pages | string | Sí | - | Rango de páginas a eliminar en sintaxis qpdf, p. ej. `"3,5-7"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- No puedes eliminar todas las páginas de un documento; debe quedar al menos una página.
- Los rangos de páginas usan la sintaxis de qpdf: `3` para una sola página, `5-7` para un rango y comas para combinar (p. ej. `1,3,5-7`).
