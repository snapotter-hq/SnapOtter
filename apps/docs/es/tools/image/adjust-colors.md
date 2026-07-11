---
description: "Ajusta el brillo, el contraste, la saturación, la temperatura, el tono y los canales, y aplica efectos de color."
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: 44819c8d0152
---

# Ajustar colores {#adjust-colors}

Herramienta integral de ajuste de color que combina brillo, contraste, exposición, saturación, temperatura, matiz, rotación de tono, niveles por canal y efectos de un clic (escala de grises, sepia, invertir) en un único endpoint.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | Ajuste de brillo (-100 a 100) |
| contrast | number | No | `0` | Ajuste de contraste (-100 a 100) |
| exposure | number | No | `0` | Exposición / gamma de tonos medios (-100 a 100) |
| saturation | number | No | `0` | Saturación de color (-100 a 100) |
| temperature | number | No | `0` | Balance de blancos: frío/azul a cálido/naranja (-100 a 100) |
| tint | number | No | `0` | Cambio de matiz: verde a magenta (-100 a 100) |
| hue | number | No | `0` | Rotación de tono en grados (-180 a 180) |
| sharpness | number | No | `0` | Intensidad de enfoque (0 a 100) |
| red | number | No | `100` | Nivel del canal rojo (0 a 200, 100 = sin cambios) |
| green | number | No | `100` | Nivel del canal verde (0 a 200, 100 = sin cambios) |
| blue | number | No | `100` | Nivel del canal azul (0 a 200, 100 = sin cambios) |
| effect | string | No | `"none"` | Efecto de color: `none`, `grayscale`, `sepia`, `invert` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

Aplica un aspecto vintage cálido:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notes {#notes}

- Todos los parámetros toman por defecto valores neutros, de modo que puedes ajustar solo lo que necesites.
- Los ajustes se aplican en este orden: brillo, contraste, exposición, saturación/tono, temperatura/matiz, enfoque, canales, efectos.
- La temperatura usa una matriz de recombinación de color de 3x3 sobre los ejes azul-naranja y verde-magenta.
- La exposición se corresponde con la función gamma de Sharp (los valores positivos aclaran los tonos medios y los negativos los oscurecen).
- Este endpoint también responde en las rutas heredadas `/api/v1/tools/image/brightness-contrast`, `/api/v1/tools/image/saturation`, `/api/v1/tools/image/color-channels` y `/api/v1/tools/image/color-effects`. Todas usan el mismo esquema.
- El formato de salida coincide con el de entrada. Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del procesamiento.
