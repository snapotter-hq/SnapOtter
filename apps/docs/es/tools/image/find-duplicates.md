---
description: "Detecta imágenes duplicadas y casi duplicadas mediante hashing perceptual."
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: 9b7273b42cee
---

# Buscar duplicados {#find-duplicates}

Sube varias imágenes para detectar duplicados y casi duplicados mediante hashing perceptual (dHash). Agrupa las imágenes similares, identifica la versión de mejor calidad de cada grupo y calcula el ahorro de espacio potencial.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

Acepta datos de formulario multipart con varios archivos de imagen y un campo JSON `settings` opcional.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| threshold | number | No | `8` | Distancia de Hamming máxima para considerar imágenes como duplicadas (0 a 20). Menor = coincidencia más estricta |

### Campos de archivo {#file-fields}

Sube al menos 2 archivos de imagen en la solicitud multipart (todos usando el nombre de campo `file` o cualquier nombre de campo para las partes de archivo).

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## Campos de la respuesta {#response-fields}

| Campo | Tipo | Descripción |
|-------|------|-------------|
| totalImages | number | Número de imágenes analizadas correctamente |
| duplicateGroups | array | Grupos de imágenes duplicadas |
| uniqueImages | number | Número de imágenes que no forman parte de ningún grupo de duplicados |
| spaceSaveable | number | Total de bytes que podrían ahorrarse al eliminar los duplicados que no son los mejores |
| skippedFiles | array | Archivos que no pudieron procesarse (con nombre de archivo y motivo) |

### Objeto de grupo de duplicados {#duplicate-group-object}

| Campo | Tipo | Descripción |
|-------|------|-------------|
| groupId | number | Identificador del grupo |
| files | array | Imágenes de este grupo de duplicados |

### Objeto de archivo (dentro de un grupo) {#file-object-within-a-group}

| Campo | Tipo | Descripción |
|-------|------|-------------|
| filename | string | Nombre de archivo original |
| similarity | number | Porcentaje de similitud con la imagen de referencia (la primera del grupo) |
| width | number | Ancho de la imagen en píxeles |
| height | number | Alto de la imagen en píxeles |
| fileSize | number | Tamaño del archivo en bytes |
| format | string | Formato de la imagen |
| isBest | boolean | Si es la versión de mayor calidad (más píxeles, archivo más grande) |
| thumbnail | string o null | Miniatura JPEG en base64 (200 px de ancho) para la vista previa |

## Notas {#notes}

- Usa un dHash de 128 bits (64 bits de fila + 64 bits de columna) para la detección de similitud perceptual. Esto detecta duplicados incluso tras redimensionar, recomprimir y realizar ediciones menores.
- El umbral representa la distancia de Hamming máxima entre hashes. El valor predeterminado de 8 detecta casi duplicados evitando falsos positivos. Usa 0 para solo idénticos a nivel de píxel, o 15-20 para una coincidencia muy laxa.
- La imagen "mejor" de cada grupo es la que tiene más píxeles (ancho x alto), con el tamaño del archivo como criterio de desempate.
- Se requieren al menos 2 imágenes. Los archivos que no superan la validación o la decodificación se reportan en `skippedFiles` en lugar de hacer fallar toda la solicitud.
- Las miniaturas son vistas previas JPEG de 200 px de ancho codificadas como URI de datos.
- Se admiten todos los formatos comunes (HEIC, RAW, PSD, SVG se decodifican automáticamente).
