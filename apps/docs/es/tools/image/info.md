---
description: "Consulta metadatos, propiedades y estadísticas de histograma por canal detallados de una imagen."
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: c1e00b8a5016
---

# Información de la imagen {#image-info}

Herramienta de análisis de solo lectura que devuelve metadatos completos de la imagen, incluidos las dimensiones, el formato, el espacio de color, la presencia de EXIF/ICC/XMP y estadísticas de histograma por canal. No produce un archivo de salida procesado.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/info`

Acepta datos de formulario multipart con un archivo de imagen. No se necesita ningún campo de configuración.

## Parámetros {#parameters}

Esta herramienta no tiene parámetros configurables. Simplemente sube el archivo de imagen.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|----------|-------------|
| file | file | Sí | La imagen a analizar |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Ejemplo de respuesta {#example-response}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## Campos de la respuesta {#response-fields}

| Campo | Tipo | Descripción |
|-------|------|-------------|
| filename | string | Nombre de archivo saneado |
| fileSize | number | Tamaño del archivo en bytes |
| width | number | Ancho de la imagen en píxeles |
| height | number | Alto de la imagen en píxeles |
| format | string | Formato detectado (jpeg, png, webp, etc.) |
| channels | number | Número de canales de color |
| hasAlpha | boolean | Si la imagen tiene un canal alfa |
| colorSpace | string | Espacio de color (srgb, cmyk, etc.) |
| density | number o null | Resolución DPI/PPI |
| isProgressive | boolean | Si el JPEG usa codificación progresiva |
| orientation | number o null | Valor de orientación EXIF (1-8) |
| hasProfile | boolean | Si hay un perfil ICC incrustado |
| hasExif | boolean | Si hay metadatos EXIF presentes |
| hasIcc | boolean | Si hay un perfil de color ICC presente |
| hasXmp | boolean | Si hay metadatos XMP presentes |
| bitDepth | string o null | Bits por muestra |
| pages | number | Número de páginas (para formatos multipágina como TIFF, GIF) |
| histogram | array | Estadísticas por canal (mín., máx., media, desviación estándar) |

## Notas {#notes}

- Este es un endpoint de solo lectura. No produce un archivo de salida descargable ni un `jobId`.
- Para las imágenes en formato RAW (DNG, CR2, NEF, ARW, etc.), se usa ExifTool para extraer las dimensiones reales del sensor y los indicadores de metadatos que Sharp no puede leer directamente.
- Los archivos HEIC/HEIF se decodifican internamente a PNG para extraer las estadísticas de píxeles, ya que Sharp no puede decodificar píxeles HEVC.
- El histograma proporciona mín./máx./media/desviación estándar por canal, no una distribución completa de 256 bins.
- El campo `density` refleja los metadatos de DPI incrustados, si están presentes.
