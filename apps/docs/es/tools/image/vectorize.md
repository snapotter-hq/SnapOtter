---
description: "Convierte imágenes ráster a SVG con vectorización en blanco y negro (potrace) y a todo color en varias capas."
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: 82814e99264a
---

# Imagen a SVG {#image-to-svg}

Vectoriza imágenes ráster en SVG usando algoritmos de trazado. Admite el trazado en blanco y negro (potrace) y la vectorización a todo color en varias capas.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| colorMode | string | No | `"bw"` | Modo de trazado: `bw` (blanco y negro) o `color` (capas multicolor) |
| threshold | number | No | 128 | Umbral de brillo para el modo B&N (0 a 255). Los píxeles por debajo pasan a ser negros. |
| colorPrecision | number | No | 6 | Precisión de cuantización de color para el modo de color (1 a 16). Los valores más altos producen más capas de color distintas. |
| layerDifference | number | No | 6 | Diferencia mínima de color entre capas en el modo de color (1 a 128) |
| filterSpeckle | number | No | 4 | Área mínima para las formas trazadas en píxeles (1 a 256). Elimina el ruido/las motas. |
| pathMode | string | No | `"spline"` | Suavizado de trazados: `none` (irregular), `polygon` (segmentos rectos), `spline` (curvas suaves) |
| cornerThreshold | number | No | 60 | Umbral de ángulo para la detección de esquinas en el modo de color (0 a 180 grados) |
| invert | boolean | No | `false` | Invierte la imagen antes de trazar (intercambia blanco/negro) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### Vectorización a color {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## Notas {#notes}

- La salida siempre es un archivo SVG, independientemente del formato de entrada.
- Admite los formatos de entrada HEIC, RAW, PSD y SVG (decodificados automáticamente a ráster antes de trazar).
- El modo B&N usa el algoritmo potrace. La imagen se convierte primero a escala de grises y luego se umbraliza a blanco/negro puro antes de trazar.
- El modo de color usa un enfoque multicapa: la imagen se cuantiza en capas de color, cada una trazada por separado y apilada en la salida SVG.
- Los valores más bajos de `filterSpeckle` conservan más detalle pero producen archivos SVG más grandes con más trazados.
- El ajuste `pathMode` afecta considerablemente al tamaño del archivo: `none` produce la mayor cantidad de trazados, `spline` produce la salida más suave (y normalmente más pequeña).
- Para obtener mejores resultados con logotipos e iconos, usa el modo B&N con una entrada limpia y de alto contraste. Para fotografías o ilustraciones, usa el modo de color con un valor más alto de `colorPrecision`.
