---
description: "Convierte las páginas de un PDF en imágenes de alta calidad."
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: 769618c3235a
---

# PDF a imagen {#pdf-to-image}

Convierte las páginas de un PDF en imágenes rasterizadas de alta calidad. Admite selección de páginas, varios formatos de salida, control de DPI y modos de color. Incluye subrutas de información y vista previa para inspeccionar los PDF antes de la conversión.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| format | string | No | `"png"` | Formato de salida: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | No | 150 | Resolución de renderizado (36 a 2400). Un DPI más alto produce imágenes más grandes y detalladas. |
| quality | number | No | 85 | Calidad de salida para formatos con pérdida (1 a 100) |
| colorMode | string | No | `"color"` | Modo de color: `color`, `grayscale`, `bw` (umbral de blanco y negro) |
| pages | string | No | `"all"` | Selección de páginas: `all`, página única (`3`), rango (`1-5`) o separadas por comas (`1,3,5-8`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Subruta de información {#info-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/info`

Devuelve el número de páginas de un PDF sin renderizar ninguna página.

### Solicitud de información {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Respuesta de información {#info-response}

```json
{
  "pageCount": 10
}
```

## Subruta de vista previa {#preview-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/preview`

Devuelve miniaturas JPEG de baja resolución de todas las páginas como URL de datos en base64. Útil para crear una interfaz de selección de páginas.

### Solicitud de vista previa {#preview-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Respuesta de vista previa {#preview-response}

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## Notes {#notes}

- Usa MuPDF para el renderizado de PDF, proporcionando una salida de alta fidelidad con un renderizado correcto de fuentes y gráficos vectoriales.
- Los PDF protegidos con contraseña no son compatibles y devolverán un error 400.
- El parámetro `pages` admite una sintaxis flexible:
  - `"all"` o `""` - todas las páginas
  - `"3"` - página única
  - `"1-5"` - rango de páginas (inclusivo)
  - `"1,3,5-8"` - páginas individuales y rangos combinados
- Los números de página empiezan en 1. Especificar páginas más allá de la longitud del documento devuelve un error 400.
- El endpoint principal siempre genera tanto descargas de páginas individuales como un ZIP que contiene todas las páginas seleccionadas.
- El endpoint de vista previa renderiza a 72 DPI y escala a 300px de ancho para generar miniaturas rápidamente. Las miniaturas son JPEG con un 60% de calidad.
- El endpoint de vista previa respeta la configuración del servidor `MAX_PDF_PAGES`, limitando cuántas miniaturas se generan.
- En documentos grandes con un DPI alto, el tiempo de procesamiento aumenta proporcionalmente. Considera usar un DPI más bajo (150) para uso web y un DPI más alto (300-600) para impresión.
