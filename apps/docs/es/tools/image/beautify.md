---
description: "Convierte capturas de pantalla sencillas en imágenes pulidas con fondos degradados, marcos de dispositivo, sombras y tamaños para redes sociales."
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: 9a835280cd58
---

# Embellecer captura {#beautify-screenshot}

Añade fondos degradados, marcos de dispositivo, sombras, marcas de agua y tamaños para redes sociales a las capturas de pantalla. Ideal para crear imágenes pulidas para marketing de productos, redes sociales y documentación.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | string | No | `"linear-gradient"` | Tipo de fondo: `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | string | No | `"#667eea"` | Color de fondo sólido (usado cuando `backgroundType` es `solid`) |
| gradientStops | array | No | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | Paradas de color del degradado (mín. 2). Cada parada tiene `color` (hex) y `position` (0-100). |
| gradientAngle | number | No | 135 | Ángulo del degradado en grados (0 a 360) |
| padding | number | No | 64 | Relleno alrededor de la imagen en píxeles (0 a 256) |
| borderRadius | number | No | 12 | Radio de las esquinas de la captura (0 a 64) |
| shadowPreset | string | No | `"subtle"` | Ajuste preestablecido de sombra: `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | number | No | 20 | Radio de desenfoque de sombra personalizado (0 a 100, usado cuando `shadowPreset` es `custom`) |
| shadowOffsetX | number | No | 0 | Desplazamiento horizontal de sombra personalizado (-50 a 50) |
| shadowOffsetY | number | No | 10 | Desplazamiento vertical de sombra personalizado (-50 a 50) |
| shadowColor | string | No | `"#000000"` | Color de sombra personalizado en hex |
| shadowOpacity | number | No | 30 | Opacidad de sombra personalizada (0 a 100) |
| frame | string | No | `"none"` | Marco de dispositivo o ventana: `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | string | No | - | Texto del título mostrado en las barras de título de los marcos de ventana |
| socialPreset | string | No | `"none"` | Redimensiona a dimensiones de redes sociales: `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | string | No | - | Texto de marca de agua opcional superpuesto |
| watermarkPosition | string | No | `"bottom-right"` | Posición de la marca de agua: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | number | No | 50 | Opacidad de la marca de agua (0 a 100) |
| outputFormat | string | No | `"png"` | Formato de salida: `png`, `jpeg`, `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### With Background Image {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Notes {#notes}

- Acepta dos campos de archivo: `file` (obligatorio, la captura de pantalla principal) y `backgroundImage` (opcional, usado cuando `backgroundType` es `image`).
- Admite los formatos de entrada HEIC, RAW, PSD y SVG (se decodifican automáticamente).
- Los ajustes preestablecidos de sombra se corresponden con valores específicos:
  - `subtle`: desenfoque 20, offsetY 4, opacidad 20%
  - `medium`: desenfoque 40, offsetY 10, opacidad 35%
  - `dramatic`: desenfoque 80, offsetY 20, opacidad 50%
- Los ajustes preestablecidos para redes sociales redimensionan la salida final para adaptarla a las dimensiones de destino usando el modo `contain`:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- Los marcos de dispositivo (`iphone`, `macbook`, `ipad`) aplican un bisel de hardware alrededor de la imagen y omiten el ajuste `borderRadius`.
- Cuando se requiere transparencia (sombra, radio de borde, marcos de dispositivo o fondo transparente), la salida se fuerza a PNG aunque se haya seleccionado `jpeg`.
- Los fondos de imagen no se admiten en modo pipeline/lote.
