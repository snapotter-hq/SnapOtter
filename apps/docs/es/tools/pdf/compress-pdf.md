---
description: "Reduce el tamaño de un archivo PDF comprimiendo las imágenes incrustadas."
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: 4af7513b61bc
---

# Comprimir PDF {#compress-pdf}

Reduce el tamaño de un archivo PDF submuestreando las imágenes incrustadas. Elige entre un control deslizante de calidad o un tamaño de archivo objetivo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | Modo de compresión: `quality` o `targetSize` |
| quality | integer | No | `75` | Calidad de compresión, 1-100 (mayor = menos compresión). Se usa en el modo `quality` |
| targetSizeKb | number | No | - | Tamaño de archivo objetivo en kilobytes. Se usa en el modo `targetSize` |

## Example Request {#example-request}

Comprimir por calidad:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Comprimir a un tamaño objetivo:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- En el modo `quality`, los valores más bajos producen archivos más pequeños con mayor degradación de la imagen.
- En el modo `targetSize`, una búsqueda binaria encuentra el DPI más alto que se ajusta al tamaño solicitado.
- Si la compresión aumentara el tamaño del archivo, se devuelven los bytes originales sin cambios.
- El contenido de texto y vectorial no se ve afectado; solo se submuestrean las imágenes rasterizadas incrustadas.
