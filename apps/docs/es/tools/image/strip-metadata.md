---
description: "Elimina metadatos EXIF, GPS, ICC y XMP de las imágenes para mayor privacidad y menor tamaño de archivo."
i18n_source_hash: 07f61cdb2c26
i18n_provenance: human
i18n_output_hash: a5c840a8408d
---

# Eliminar metadatos de imagen {#remove-metadata}

Elimina los metadatos EXIF, GPS, perfiles de color ICC y XMP de las imágenes. Útil para la privacidad (eliminar coordenadas GPS, información de la cámara) y para reducir el tamaño del archivo.

## API Endpoints {#api-endpoints}

### Eliminar metadatos {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

Procesa la imagen y devuelve una versión limpia con los metadatos seleccionados eliminados.

### Inspeccionar metadatos {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

Devuelve los metadatos analizados como JSON sin modificar la imagen. Útil para previsualizar qué metadatos existen antes de eliminarlos.

## Parámetros (Eliminar) {#parameters-strip}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | No | `false` | Elimina los datos EXIF (ajustes de la cámara, fechas, etc.) |
| stripGps | boolean | No | `false` | Elimina solo los datos de GPS/ubicación |
| stripIcc | boolean | No | `false` | Elimina el perfil de color ICC |
| stripXmp | boolean | No | `false` | Elimina los metadatos XMP (Adobe, IPTC) |
| stripAll | boolean | No | `true` | Elimina todos los metadatos de una vez |

Cuando `stripAll` es `true`, anula los indicadores individuales y elimina todo.

## Ejemplo de solicitud {#example-request}

Eliminar todos los metadatos:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

Eliminar solo los datos de GPS (conservar la información de la cámara y el perfil de color):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

Inspeccionar los metadatos sin modificar:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Ejemplo de respuesta (Eliminar) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Ejemplo de respuesta (Inspeccionar) {#example-response-inspect}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "exif": {
    "Make": "Canon",
    "Model": "EOS R5",
    "DateTimeOriginal": "2024:03:15 14:30:00",
    "ExposureTime": "1/250",
    "FNumber": 2.8,
    "ISO": 400
  },
  "gps": {
    "GPSLatitudeRef": "N",
    "GPSLatitude": [37, 46, 30],
    "_latitude": 37.775,
    "_longitude": -122.4183
  },
  "icc": {
    "Profile Size": "3144 bytes",
    "Color Space": "RGB",
    "Description": "sRGB IEC61966-2.1"
  },
  "xmp": {
    "CreatorTool": "Adobe Photoshop 25.0"
  }
}
```

## Notas {#notes}

- La imagen se vuelve a codificar en su formato original después de la eliminación. JPEG usa mozjpeg con calidad 90, PNG usa nivel de compresión 9, WebP usa calidad 85.
- Eliminar los perfiles ICC puede provocar cambios sutiles de color si la imagen estaba etiquetada con un perfil no sRGB. Usa `stripIcc: false` si la precisión del color es importante.
- El endpoint de inspección analiza las coordenadas GPS en valores decimales de latitud/longitud (con prefijo de guion bajo) para mayor comodidad.
- Formatos de entrada admitidos: JPEG, PNG, WebP, AVIF, TIFF, GIF.
