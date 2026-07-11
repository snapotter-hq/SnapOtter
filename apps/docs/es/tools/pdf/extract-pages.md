---
description: "Extrae páginas seleccionadas de un PDF a un documento nuevo."
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: b508fd09be4f
---

# Extraer páginas {#extract-pages}

Extrae páginas seleccionadas de un PDF a un documento nuevo y más pequeño.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| range | string | Sí | - | Rango de páginas en sintaxis qpdf, p. ej. `"1-5,8,10-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notes {#notes}

- Los rangos de páginas usan la sintaxis de qpdf: `1-5` para las páginas 1 a 5, `z` para la última página y comas para combinar rangos (p. ej. `1-3,7,10-z`).
- Las páginas extraídas conservan su formato, anotaciones y enlaces originales.
