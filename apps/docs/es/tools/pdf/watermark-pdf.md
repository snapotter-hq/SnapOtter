---
description: "Añade una marca de agua de texto a todas las páginas de un PDF."
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: 74862b9bda1c
---

# Marca de agua en PDF {#watermark-pdf}

Estampa una marca de agua de texto en todas las páginas de un PDF con posición, tamaño, opacidad y rotación configurables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| text | string | Sí | - | Texto de la marca de agua (1-200 caracteres) |
| position | string | No | `"c"` | Ubicación en la página: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `48` | Tamaño de fuente en puntos (6-72) |
| opacity | number | No | `0.3` | Opacidad de la marca de agua (0.05-1) |
| rotation | number | No | `45` | Ángulo de rotación en grados (-180 a 180) |

### Valores de posición {#position-values}

- `tl` arriba a la izquierda, `tc` arriba al centro, `tr` arriba a la derecha
- `l` centro a la izquierda, `c` centro, `r` centro a la derecha
- `bl` abajo a la izquierda, `bc` abajo al centro, `br` abajo a la derecha

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- La marca de agua se muestra como una superposición de texto en cada página.
- El mismo texto, posición y estilo de marca de agua se aplican de manera uniforme a todas las páginas.
- Usa valores de opacidad más bajos (0.1-0.3) para marcas de agua sutiles que no oculten el contenido.
