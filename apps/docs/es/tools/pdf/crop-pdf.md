---
description: "Recorta todas las páginas de un PDF con márgenes o a una región."
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: f58c880a8cd5
i18n_hash_version: 2
---

# Recortar PDF {#crop-pdf}

Recorta todas las páginas de un PDF con un margen en cada borde, un margen distinto por borde, o hasta una región, como una etiqueta de envío impresa en una esquina de la hoja.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| mode | string | No | `uniform` | `uniform`, `sides` o `region` |
| margin | number | No | `20` | Modo `uniform`: margen de recorte para cada borde en puntos (0-2000) |
| top, right, bottom, left | number | No | `0` | Modo `sides`: margen de recorte para cada borde por separado en puntos (0-2000) |
| x, y | number | No | `0` | Modo `region`: desplazamiento de la región desde los bordes izquierdo y superior de la página en puntos |
| width, height | number | No | `288`, `432` | Modo `region`: tamaño de la región en puntos (una etiqueta de 4x6 in) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

Conserva solo la etiqueta de 4x6 in de la esquina superior izquierda de cada página:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
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

- Todos los valores están en puntos PDF (1 punto = 1/72 de pulgada). Una página US Letter mide 612 x 792 puntos.
- Cada modo lee solo sus propios campos, así que una solicitud que envía únicamente `margin` sigue funcionando.
- Una región se mide desde la esquina superior izquierda de cada página y debe caber dentro de todas las páginas. Los márgenes deben dejar parte de cada página. De lo contrario, la solicitud falla con `400`.
- En una página configurada para mostrarse girada, las posiciones y los bordes se refieren a la página tal como se muestra, de modo que la esquina superior izquierda de una región es la esquina superior izquierda de la página girada.
- Todos los modos miden desde el media box completo, así que recortar una página que ya está recortada vuelve a empezar desde la página completa. Un margen uniforme de `0` muestra todo el media box.
