---
description: "Convierte archivos SVG a PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF o JXL con resolución y DPI personalizados, con soporte por lotes."
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: 51f4009930de
---

# SVG a ráster {#svg-to-raster}

Convierte archivos SVG a formatos de imagen ráster (PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF o JXL) con resolución y DPI personalizados. También admite la conversión por lotes de varios SVG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Ancho objetivo en píxeles (1 a 65536). Mantiene la relación de aspecto si solo se establece una dimensión. |
| height | integer | No | - | Alto objetivo en píxeles (1 a 65536). Mantiene la relación de aspecto si solo se establece una dimensión. |
| dpi | integer | No | 300 | DPI de renderizado, controla la densidad base de rasterización (36 a 2400) |
| quality | number | No | 90 | Calidad de salida para formatos con pérdida (1 a 100) |
| backgroundColor | string | No | `"#00000000"` | Color de fondo en hexadecimal (6 u 8 caracteres, 8 caracteres incluyen alfa) |
| outputFormat | string | No | `"png"` | Formato de salida: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Endpoint por lotes {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

Convierte varios archivos SVG en una sola solicitud. Devuelve un archivo ZIP.

### Parámetros adicionales por lotes {#additional-batch-parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| clientJobId | string | No | - | ID de trabajo opcional proporcionado por el cliente para el seguimiento del progreso (máx. 128 caracteres) |

### Ejemplo de solicitud por lotes {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Respuesta por lotes {#batch-response}

El endpoint por lotes transmite un archivo ZIP directamente con los encabezados:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Notas {#notes}

- Solo acepta archivos SVG y SVGZ (valida el contenido, no solo la extensión). Los SVGZ se descomprimen automáticamente.
- El contenido SVG se sanea antes del renderizado para evitar XSS y la carga de recursos externos.
- El ajuste `dpi` controla la densidad a la que se rasteriza el SVG. Un DPI más alto produce dimensiones en píxeles mayores a partir del mismo viewport del SVG.
- Cuando se proporcionan tanto `width` como `height`, la imagen se redimensiona usando `fit: inside` (mantiene la relación de aspecto dentro de los límites).
- Se incluye una `previewUrl` en la respuesta para los formatos que los navegadores no pueden mostrar de forma nativa (TIFF, HEIF). La vista previa es una miniatura WebP de 1200 px.
- El fondo predeterminado `#00000000` es totalmente transparente. Establécelo en `#FFFFFF` para un fondo blanco (útil con la salida JPEG, que no admite transparencia).
- El procesamiento por lotes respeta la configuración del servidor `MAX_BATCH_SIZE` y usa workers concurrentes por rendimiento.
- El progreso de las operaciones por lotes se puede seguir mediante SSE en `/api/v1/jobs/:jobId/progress`.
