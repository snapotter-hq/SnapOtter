---
description: "Extrae los colores dominantes de una imagen como una paleta de colores."
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: 17971a931b62
---

# Paleta de colores {#color-palette}

Extrae los colores dominantes de una imagen y los devuelve como valores de color hex. Usa análisis de frecuencia cuantizado para identificar los colores más prominentes y visualmente distintivos.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings` opcional.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| count | integer | No | `8` | Número de colores que se extraen (2-16) |
| format | string | No | `"hex"` | Formato de color: `hex`, `rgb`, `hsl` |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## Campos de respuesta {#response-fields}

| Campo | Tipo | Descripción |
|-------|------|-------------|
| filename | string | Nombre de archivo saneado |
| colors | array | Array de cadenas de color en el formato solicitado, ordenadas por dominancia (la más frecuente primero) |
| hex | array | Array de cadenas de color hex (siempre hex, sin importar el ajuste `format`) |
| count | number | Número de colores extraídos |

## Notas {#notes}

- Devuelve hasta `count` colores dominantes (predeterminado 8, rango 2-16), ordenados por frecuencia (el más común primero).
- La imagen se redimensiona internamente a 100x100 píxeles para el análisis, por lo que la paleta representa la distribución general del color en vez de detalles pequeños.
- Los colores se extraen mediante cuantización por corte de mediana, que divide de forma recursiva las poblaciones de píxeles a lo largo del canal con el rango más amplio.
- El canal alfa se elimina antes del análisis, por lo que las áreas transparentes no se tienen en cuenta.
- Este es un endpoint de solo lectura. No produce un archivo de salida descargable ni un `jobId`.
- Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del análisis.
