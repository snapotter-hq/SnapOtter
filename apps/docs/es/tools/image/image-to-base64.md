---
description: "Convierte imágenes a URI de datos en base64 para incrustarlas en HTML, CSS y más."
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: 8122441aadf3
---

# Imagen a base64 {#image-to-base64}

Convierte una o varias imágenes a cadenas codificadas en base64 y URI de datos. Admite conversión de formato opcional, control de calidad y redimensionado. Útil para incrustar imágenes directamente en HTML, CSS, JSON o plantillas de correo electrónico.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

Acepta datos de formulario multipart con uno o varios archivos de imagen y un campo JSON `settings` opcional.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"original"` | Convertir antes de codificar: `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | No | `80` | Calidad de salida para formatos con pérdidas (1 a 100) |
| maxWidth | number | No | `0` | Ancho máximo en píxeles (0 = sin redimensionar, no amplía) |
| maxHeight | number | No | `0` | Alto máximo en píxeles (0 = sin redimensionar, no amplía) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

Varios archivos:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## Campos de la respuesta {#response-fields}

| Campo | Tipo | Descripción |
|-------|------|-------------|
| results | array | Imágenes convertidas correctamente |
| errors | array | Imágenes que no pudieron procesarse (con nombre de archivo y mensaje de error) |

### Objeto de resultado {#result-object}

| Campo | Tipo | Descripción |
|-------|------|-------------|
| filename | string | Nombre de archivo original |
| mimeType | string | Tipo MIME de la salida codificada |
| width | number | Ancho final en píxeles (tras cualquier redimensionado) |
| height | number | Alto final en píxeles (tras cualquier redimensionado) |
| originalSize | number | Tamaño del archivo original en bytes |
| encodedSize | number | Tamaño de la cadena en base64 en bytes |
| overheadPercent | number | Diferencia de tamaño en porcentaje frente al original (positivo = mayor, negativo = menor) |
| base64 | string | Datos de imagen codificados en base64 sin procesar |
| dataUri | string | URI de datos completo listo para usar en atributos `src` |

## Notas {#notes}

- La codificación en base64 suele aumentar el tamaño aproximadamente un 33 % en comparación con el archivo binario. El campo `overheadPercent` muestra la diferencia real.
- Cuando `outputFormat` es `"original"`, los archivos HEIC/HEIF se convierten a JPEG (ya que los navegadores no pueden mostrar HEIC en URI de datos).
- Las opciones `maxWidth` y `maxHeight` redimensionan usando `fit: inside` con `withoutEnlargement`, por lo que las imágenes más pequeñas que las dimensiones especificadas no se amplían.
- Se pueden procesar varios archivos en una sola solicitud. Cada archivo se procesa de forma independiente, y los fallos no impiden que otros archivos se procesen correctamente.
- Los archivos SVG se transfieren tal cual como `image/svg+xml` sin volver a codificarse (salvo que se solicite una conversión de formato).
- Este es un endpoint de solo lectura. No produce un archivo descargable ni un `jobId`. Los datos en base64 se devuelven directamente en el cuerpo de la respuesta.
