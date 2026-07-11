---
description: "Gira las páginas de un PDF 90, 180 o 270 grados."
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: 738f860fb4f7
---

# Girar PDF {#rotate-pdf}

Gira todas las páginas de un PDF, o las seleccionadas, en un ángulo determinado.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| angle | integer | No | `90` | Ángulo de rotación: `90`, `180` o `270` |
| range | string | No | `"1-z"` | Rango de páginas en sintaxis qpdf, p. ej. `"1-5,8"` (`"1-z"` = todas las páginas) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
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

- La rotación es en el sentido de las agujas del reloj.
- Los rangos de páginas usan la sintaxis de qpdf: `1-5` para las páginas 1 a 5, `z` para la última página y comas para combinar rangos.
- El rango predeterminado `"1-z"` gira todas las páginas.
