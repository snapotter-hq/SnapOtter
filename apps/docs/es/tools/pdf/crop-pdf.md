---
description: "Recorta todas las páginas de un PDF con un margen uniforme."
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: 0139ec3de2b1
---

# Recortar PDF {#crop-pdf}

Recorta todas las páginas de un PDF aplicando un margen uniforme, eliminando contenido de cada borde por igual.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| margin | number | No | `20` | Margen de recorte uniforme en puntos (0-2000) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- El valor del margen está en puntos PDF (1 punto = 1/72 de pulgada).
- El mismo margen se aplica a los cuatro bordes de cada página.
- Un margen de `0` elimina todos los márgenes de recorte existentes, mostrando el media box completo.
