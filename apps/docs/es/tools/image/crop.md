---
description: "Recorta imágenes especificando una región con posición y dimensiones."
i18n_source_hash: 556f37893553
i18n_provenance: human
i18n_output_hash: ac5e5e050598
---

# Recortar imagen {#crop}

Recorta imágenes definiendo una región rectangular mediante posición y tamaño. Admite unidades tanto de píxeles como de porcentaje.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/crop`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| left | number | Sí | - | Desplazamiento X de la región de recorte (desde el borde izquierdo) |
| top | number | Sí | - | Desplazamiento Y de la región de recorte (desde el borde superior) |
| width | number | Sí | - | Ancho de la región de recorte |
| height | number | Sí | - | Alto de la región de recorte |
| unit | string | No | `"px"` | Unidad para los valores: `px` o `percent` |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

Recortar usando valores de porcentaje:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Notas {#notes}

- La región de recorte debe caber dentro de los límites de la imagen. Si la región se extiende más allá de la imagen, la solicitud fallará.
- Al usar la unidad `percent`, los valores representan porcentajes de las dimensiones de la imagen (p. ej. `left: 10` significa 10 % desde el borde izquierdo).
- El formato de salida coincide con el formato de entrada.
- La orientación EXIF se aplica automáticamente antes del recorte, por lo que las coordenadas corresponden a la orientación visualmente correcta.
