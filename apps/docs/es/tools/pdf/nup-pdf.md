---
description: "Organiza varias páginas de PDF por hoja (2 por hoja, 4 por hoja, etc.)."
i18n_source_hash: 972bf997c95c
i18n_provenance: human
i18n_output_hash: b48b0f902104
---

# Páginas por hoja (N-up) {#n-up-pdf}

Organiza varias páginas por hoja para ahorrar papel al imprimir, como los diseños de 2 por hoja o 4 por hoja.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | Páginas por hoja: `2`, `3`, `4`, `8`, `9`, `12` o `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- Las páginas se organizan en orden de lectura (de izquierda a derecha, de arriba abajo).
- El tamaño de la página de salida coincide con el original; las páginas individuales se reducen para ajustarse a la cuadrícula.
- Un documento de 20 páginas con `perSheet: 4` produce una salida de 5 páginas.
