---
description: "Añade números de página a todas las páginas de un PDF."
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: 8b27258ccd52
---

# Números de página de PDF {#pdf-page-numbers}

Añade números de página con el formato «Página N de M» a todas las páginas de un PDF.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bc"` | Ubicación del número de página: `bl`, `bc`, `br`, `tl`, `tc`, `tr` |
| fontSize | integer | No | `10` | Tamaño de fuente en puntos (6-24) |

### Valores de posición {#position-values}

- `tl` arriba a la izquierda, `tc` arriba al centro, `tr` arriba a la derecha
- `bl` abajo a la izquierda, `bc` abajo al centro, `br` abajo a la derecha

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- Los números de página se muestran con el formato «Página 1 de 10».
- Los números se añaden a todas las páginas, incluidas las páginas de título o portada existentes.
- La posición predeterminada `"bc"` coloca los números en el centro inferior de cada página.
