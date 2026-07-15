---
description: "Edita campos de metadatos EXIF, IPTC, GPS y XMP en imágenes sin recodificar los píxeles."
i18n_source_hash: 9271d3d8f278
i18n_provenance: human
i18n_output_hash: 9ee294905c8a
---

# Editar metadatos de imagen {#edit-metadata}

Edita campos de metadatos de imagen, incluidos EXIF, IPTC, coordenadas GPS, fechas y palabras clave. Usa ExifTool internamente, por lo que los metadatos se escriben en el sitio sin recodificar los píxeles, preservando la calidad completa de la imagen.

## Endpoints de la API {#api-endpoints}

### Editar metadatos {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

Escribe campos de metadatos en la imagen y devuelve el archivo modificado.

### Inspeccionar metadatos {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

Devuelve todos los metadatos de la imagen mediante ExifTool como JSON. No modifica la imagen.

## Parámetros (Editar) {#parameters-edit}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| title | string | No | - | Título de la imagen (XMP/EXIF) |
| author | string | No | - | Nombre del autor |
| artist | string | No | - | Nombre del artista (etiqueta EXIF Artist) |
| copyright | string | No | - | Aviso de derechos de autor |
| imageDescription | string | No | - | Descripción de la imagen (EXIF) |
| software | string | No | - | Etiqueta de software |
| dateTime | string | No | - | Valor EXIF DateTime |
| dateTimeOriginal | string | No | - | Valor EXIF DateTimeOriginal |
| setAllDates | string | No | - | Establece todos los campos de fecha a la vez |
| dateShift | string | No | - | Desplaza todas las fechas por un valor de compensación (formato: `+HH:MM` o `-HH:MM`) |
| clearGps | boolean | No | `false` | Elimina todos los datos GPS |
| gpsLatitude | number | No | - | Establece la latitud GPS (-90 a 90) |
| gpsLongitude | number | No | - | Establece la longitud GPS (-180 a 180) |
| gpsAltitude | number | No | - | Establece la altitud GPS en metros |
| keywords | string[] | No | - | Palabras clave/etiquetas que se añaden o establecen |
| keywordsMode | string | No | `"add"` | Cómo tratar las palabras clave: `add` (añadir) o `set` (reemplazar) |
| fieldsToRemove | string[] | No | `[]` | Lista de nombres específicos de campos de metadatos que se eliminan |
| iptcTitle | string | No | - | IPTC Object Name |
| iptcHeadline | string | No | - | IPTC Headline |
| iptcCity | string | No | - | IPTC City |
| iptcState | string | No | - | IPTC Province/State |
| iptcCountry | string | No | - | IPTC Country |

## Ejemplo de solicitud {#example-request}

Establecer autor y derechos de autor:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

Establecer coordenadas GPS:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

Eliminar GPS y añadir palabras clave:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

Inspeccionar metadatos:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Ejemplo de respuesta (Editar) {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## Notas {#notes}

- Esta herramienta requiere que ExifTool esté instalado en el servidor. Está incluido en la imagen de Docker.
- Los metadatos se escriben en el sitio, por lo que no se produce recodificación de píxeles. El cambio en el tamaño del archivo es mínimo (solo los bytes de metadatos).
- El parámetro `dateShift` desplaza todos los campos de fecha por la compensación especificada, útil para corregir errores de zona horaria (p. ej. `+02:00` o `-05:30`).
- Si no se solicitan cambios (todos los parámetros omitidos o vacíos), el archivo original se devuelve sin cambios.
- Formatos admitidos: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF.
- Para los formatos que no se pueden previsualizar en el navegador (HEIF, TIFF), la respuesta incluye un campo `previewUrl` con una vista previa WebP.
