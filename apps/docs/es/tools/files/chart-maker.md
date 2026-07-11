---
description: "Crea gráficos de barras, líneas o circulares a partir de datos CSV o JSON."
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: c9c82b6a033f
---

# Creador de gráficos {#chart-maker}

Crea gráficos de barras, líneas o circulares a partir de datos CSV o JSON. Devuelve una imagen PNG del gráfico renderizado.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

Acepta datos de formulario multipart con un archivo CSV o JSON y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| kind | string | No | `"bar"` | Tipo de gráfico: `bar`, `line`, `pie` |
| title | string | No | - | Título del gráfico (máximo 120 caracteres) |
| width | integer | No | `960` | Ancho del gráfico en píxeles (320-2048) |
| height | integer | No | `540` | Alto del gráfico en píxeles (240-1536) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/chart-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@sales.csv" \
  -F 'settings={"kind": "line", "title": "Monthly Sales", "width": 960, "height": 540}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sales_chart.png",
  "originalSize": 1024,
  "processedSize": 48500
}
```

## Notas {#notes}

- La entrada debe ser un archivo `.csv` o `.json`. Los archivos CSV deben tener una fila de encabezado con los nombres de las columnas.
- La primera columna se usa como etiqueta de categoría; la segunda columna debe ser numérica y proporciona los valores de datos. Solo se usan dos columnas.
- La entrada JSON debe ser un arreglo de objetos `{label, value}`, o un objeto simple cuyas claves se conviertan en etiquetas y cuyos valores se conviertan en puntos de datos.
- Máximo 100 puntos de datos. Todos los valores deben ser cero o mayores.
- La salida siempre es una imagen PNG, independientemente del formato de entrada.
