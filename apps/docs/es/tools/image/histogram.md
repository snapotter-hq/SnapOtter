---
description: "Genera un gráfico de histograma RGB con estadísticas por canal a partir de una imagen."
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: 6fd63913f7b7
---

# Histograma {#histogram}

Genera un gráfico de histograma RGB a partir de una imagen. Devuelve una imagen de histograma PNG junto con estadísticas por canal y datos de histograma sin procesar de 256 bins en el JSON de la respuesta.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/histogram`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| scale | string | No | `"linear"` | Escala del eje Y: `linear` o `log` |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/histogram.png",
  "originalSize": 2450000,
  "processedSize": 12000,
  "bins": {
    "r": [0, 12, 45, "... (256 values)"],
    "g": [0, 8, 38, "... (256 values)"],
    "b": [2, 15, 52, "... (256 values)"],
    "lum": [0, 10, 40, "... (256 values)"]
  },
  "stats": {
    "r": { "mean": 128, "median": 132, "stdev": 48.5 },
    "g": { "mean": 119, "median": 121, "stdev": 44.2 },
    "b": { "mean": 105, "median": 108, "stdev": 51.3 },
    "lum": { "mean": 118, "median": 120, "stdev": 45.1 }
  },
  "mean": { "r": 128, "g": 119, "b": 105 },
  "max": { "r": 4200, "g": 3800, "b": 4100 }
}
```

## Notas {#notes}

- El `downloadUrl` apunta a un gráfico de histograma PNG renderizado que muestra las distribuciones de R, G, B y luminancia.
- `bins` contiene matrices sin procesar de 256 valores por cada canal (rojo, verde, azul, luminancia), adecuadas para renderizar visualizaciones personalizadas.
- `stats` proporciona la media, la mediana y la desviación estándar por canal.
- `mean` y `max` son campos abreviados retrocompatibles.
- Usa la escala `log` cuando el histograma está dominado por unos pocos picos y quieres ver el detalle en los bins más bajos.
- Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del análisis.
