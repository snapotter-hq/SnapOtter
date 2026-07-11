---
description: "Combina una o varias imágenes en un documento PDF con opciones de tamaño de página, orientación y tamaño de archivo objetivo."
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: 8e62eb907ecd
---

# Imagen a PDF {#image-to-pdf}

Combina una o varias imágenes en un documento PDF. Admite varios tamaños de página, orientaciones, márgenes y, opcionalmente, ajuste al tamaño de archivo objetivo mediante el ajuste de la calidad.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

Acepta datos de formulario multipart con uno o varios archivos de imagen y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"A4"` | Tamaño de página: `A4`, `Letter`, `A3`, `A5` |
| orientation | string | No | `"portrait"` | Orientación de la página: `portrait` o `landscape` |
| margin | number | No | `20` | Margen de la página en puntos (0-500) |
| targetSize | object | No | - | Restricción de tamaño de archivo objetivo (ver más abajo) |
| collate | boolean | No | `true` | Combinar todas las imágenes en un solo PDF. Si es `false`, crea un PDF por imagen. |

### Objeto de tamaño objetivo {#target-size-object}

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|----------|-------------|
| value | number | Sí | Valor del tamaño objetivo |
| unit | string | Sí | Unidad: `KB` o `MB` |

El tamaño objetivo mínimo es 50 KB.

## Ejemplo de solicitud {#example-request}

PDF básico con varias imágenes:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

Con tamaño de archivo objetivo:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

Un PDF por imagen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## Ejemplo de respuesta (combinado) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## Ejemplo de respuesta (sin combinar) {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## Ejemplo de respuesta (con tamaño objetivo) {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## Notas {#notes}

- Las imágenes se centran en la página y se escalan para caber dentro de los márgenes conservando la relación de aspecto. Las imágenes nunca se amplían.
- Cuando `collate` es `false`, cada imagen se convierte en un archivo PDF independiente, y la descarga es un archivo ZIP que contiene todos los PDF.
- La función de tamaño objetivo usa una búsqueda binaria iterativa sobre los niveles de calidad JPEG (10-95) para encontrar la mejor calidad que quepa dentro del límite.
- Las imágenes transparentes se aplanan a blanco antes de incrustarse en el PDF.
- Formatos de entrada admitidos: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG y más.
- La orientación EXIF se aplica automáticamente antes de incrustar.
