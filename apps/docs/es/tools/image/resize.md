---
description: "Redimensiona imágenes por píxeles, porcentaje o con modos de ajuste."
i18n_source_hash: 53866e8266b8
i18n_provenance: human
i18n_output_hash: 3b1491e69697
---

# Redimensionar imagen {#resize}

Redimensiona imágenes especificando dimensiones exactas en píxeles, un factor de escala en porcentaje o un modo de ajuste que controla cómo se adapta la imagen a las dimensiones de destino.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/resize`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Ancho de destino en píxeles (máximo 16383) |
| height | integer | No | - | Alto de destino en píxeles (máximo 16383) |
| fit | string | No | `"contain"` | Cómo se ajusta la imagen a las dimensiones: `contain`, `cover`, `fill`, `inside`, `outside` |
| withoutEnlargement | boolean | No | `false` | Evitar el escalado hacia arriba si la imagen es más pequeña que el destino |
| percentage | number | No | - | Escalar por porcentaje (por ejemplo, 50 para la mitad del tamaño) |

Debe proporcionarse al menos uno de `width`, `height` o `percentage`.

### Modos de ajuste {#fit-modes}

- **contain** - Redimensiona para ajustarse dentro de las dimensiones, conservando la relación de aspecto (puede dejar espacio vacío)
- **cover** - Redimensiona para cubrir las dimensiones, conservando la relación de aspecto (puede recortar)
- **fill** - Estira para coincidir exactamente con las dimensiones (ignora la relación de aspecto)
- **inside** - Como `contain`, pero solo reduce, nunca amplía
- **outside** - Como `cover`, pero solo reduce, nunca amplía

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

Redimensionar por porcentaje:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notas {#notes}

- La dimensión máxima es de 16383 píxeles en cualquiera de los ejes (límite de Sharp/libvips).
- El formato de salida coincide con el formato de entrada. Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del procesamiento.
- La orientación EXIF se aplica automáticamente antes de redimensionar.
- El indicador `withoutEnlargement` es útil para el procesamiento por lotes en el que algunas imágenes ya podrían ser más pequeñas que el destino.
