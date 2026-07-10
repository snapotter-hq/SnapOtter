---
description: "Añade bordes, relleno, esquinas redondeadas y sombras paralelas a las imágenes en un orden predecible y controlable."
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: 2605f8c6463f
---

# Borde y marco {#border-frame}

Añade bordes, relleno, esquinas redondeadas y sombras paralelas a las imágenes. La herramienta aplica los efectos en orden: relleno, borde, radio de esquina y luego sombra.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/border`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| borderWidth | number | No | 10 | Grosor del borde en píxeles (0 a 2000) |
| borderColor | string | No | `"#000000"` | Color del borde en hex (por ejemplo, `#FF0000`) |
| padding | number | No | 0 | Relleno interior entre la imagen y el borde en píxeles (0 a 200) |
| paddingColor | string | No | `"#FFFFFF"` | Color de relleno del padding en hex |
| cornerRadius | number | No | 0 | Radio de las esquinas en píxeles (0 a 2000) |
| shadow | boolean | No | `false` | Si se debe añadir una sombra paralela |
| shadowBlur | number | No | 15 | Radio de desenfoque de la sombra (1 a 200) |
| shadowOffsetX | number | No | 0 | Desplazamiento horizontal de la sombra (-50 a 50) |
| shadowOffsetY | number | No | 5 | Desplazamiento vertical de la sombra (-50 a 50) |
| shadowColor | string | No | `"#000000"` | Color de la sombra en hex |
| shadowOpacity | number | No | 40 | Porcentaje de opacidad de la sombra (0 a 100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Notes {#notes}

- Usa la fábrica estándar `createToolRoute`. Acepta un único archivo de imagen mediante subida multipart.
- Admite los formatos de entrada HEIC, RAW, PSD y SVG (se decodifican automáticamente).
- Orden de procesamiento: primero se añade el relleno, luego el borde lo envuelve, después se aplica el radio de esquina y por último se compone la sombra.
- Cuando `cornerRadius` o `shadow` está habilitado, la salida se fuerza a PNG (independientemente del formato de entrada) para conservar la transparencia. Los formatos que admiten alfa (PNG, WebP, AVIF) mantienen su formato original.
- La sombra tiene en cuenta la forma: sigue las esquinas redondeadas en lugar de crear una sombra rectangular.
- Ajustar `borderWidth` a 0 y usar solo `cornerRadius` + `shadow` crea un efecto de sombra redondeada sin marco.
