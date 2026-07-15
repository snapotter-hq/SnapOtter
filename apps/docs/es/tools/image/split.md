---
description: "Divide una imagen en teselas de cuadrícula por filas y columnas o por tamaño en píxeles, devueltas como archivo ZIP."
i18n_source_hash: 838f5fa791b0
i18n_provenance: human
i18n_output_hash: 2fb6a84c24e9
---

# Dividir imagen {#image-splitting}

Divide una sola imagen en teselas de cuadrícula por número de columnas/filas o por dimensiones específicas en píxeles. Devuelve un archivo ZIP con todas las teselas.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/split`

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| columns | integer | No | 3 | Número de columnas en las que dividir (1 a 100) |
| rows | integer | No | 3 | Número de filas en las que dividir (1 a 100) |
| tileWidth | integer | No | - | Ancho de tesela en píxeles (mín. 10). Anula `columns` cuando se establecen tanto `tileWidth` como `tileHeight`. |
| tileHeight | integer | No | - | Alto de tesela en píxeles (mín. 10). Anula `rows` cuando se establecen tanto `tileWidth` como `tileHeight`. |
| outputFormat | string | No | `"original"` | Formato de salida de las teselas: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | Calidad de salida para formatos con pérdida (1 a 100) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Ejemplo de respuesta {#example-response}

La respuesta se transmite directamente como un archivo ZIP con `Content-Type: application/zip`. El nombre del archivo sigue el patrón `split-<jobId>.zip`.

Cada tesela dentro del ZIP se nombra `<originalBaseName>_r<row>_c<col>.<ext>` (por ejemplo, `photo_r1_c1.png`, `photo_r2_c3.webp`).

## Notas {#notes}

- Acepta un solo archivo de imagen.
- Admite los formatos de entrada HEIC, RAW, PSD y SVG (decodificados automáticamente).
- Cuando se proporcionan tanto `tileWidth` como `tileHeight`, tienen prioridad sobre `columns`/`rows`. Las dimensiones de la cuadrícula se calculan como `ceil(imageWidth / tileWidth)` y `ceil(imageHeight / tileHeight)`.
- Las teselas de los bordes (columna más a la derecha, fila inferior) pueden ser más pequeñas que el tamaño de tesela especificado si las dimensiones de la imagen no son divisibles de forma exacta.
- El tamaño máximo de la cuadrícula está limitado a 100x100 (10.000 teselas).
- La respuesta transmite el ZIP directamente, por lo que no hay cuerpo de respuesta en JSON. Usa `--output` con curl para guardar el archivo.
