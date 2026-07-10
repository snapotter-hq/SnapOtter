---
description: "Superpone un logotipo o imagen como marca de agua con posición, opacidad y escala configurables."
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: 916139c54b71
---

# Marca de agua de imagen {#image-watermark}

Superpone un logotipo o una imagen secundaria como marca de agua sobre una imagen base. La marca de agua se escala en relación con el ancho de la imagen base y se posiciona en una esquina o en el centro.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

Acepta datos de formulario multipart con **dos** archivos de imagen y un campo `settings` en JSON.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bottom-right"` | Ubicación de la marca de agua: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| opacity | number | No | `50` | Porcentaje de opacidad de la marca de agua (0 a 100) |
| scale | number | No | `25` | Ancho de la marca de agua como porcentaje del ancho de la imagen principal (1 a 100) |

### Campos de archivo {#file-fields}

| Nombre del campo | Obligatorio | Descripción |
|------------|----------|-------------|
| file | Sí | La imagen principal/base |
| watermark | Sí | La imagen de la marca de agua/logotipo |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## Notas {#notes}

- Ambas imágenes se validan y decodifican (se admiten HEIC, RAW, PSD, SVG).
- La marca de agua se redimensiona proporcionalmente de modo que su ancho sea igual al `scale` % del ancho de la imagen principal.
- La opacidad se aplica mediante una máscara alfa compuesta con mezcla `dest-in`.
- Las posiciones en las esquinas usan un relleno de 20 px desde el borde de la imagen.
- Si la imagen de la marca de agua tiene transparencia (por ejemplo, un logotipo PNG), se conserva durante la composición.
- La orientación EXIF se aplica automáticamente en ambas imágenes antes del procesamiento.
