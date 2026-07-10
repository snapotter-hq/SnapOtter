---
description: "Extrae páginas o divide un PDF en partes."
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: c0ffa44dbe7b
---

# Dividir PDF {#split-pdf}

Extrae un rango de páginas a un nuevo PDF, o divide un documento en fragmentos de N páginas.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"range"` | Modo de división: `range` o `every` |
| range | string | Cuando el modo es `range` | - | Rango de páginas en sintaxis qpdf, p. ej. `"1-5,8,10-z"` |
| everyN | integer | Cuando el modo es `every` | - | Dividir en fragmentos de N páginas (1-500) |

## Example Request {#example-request}

Extraer páginas específicas:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

Dividir en fragmentos de 10 páginas:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- En el modo `range`, se devuelve un único PDF que contiene las páginas seleccionadas.
- En el modo `every`, el resultado es un archivo ZIP que contiene las partes individuales.
- Los rangos de páginas usan la sintaxis de qpdf: `1-5` para las páginas 1 a 5, `z` para la última página y comas para combinar rangos (p. ej. `1-3,7,10-z`).
