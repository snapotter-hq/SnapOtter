---
description: "Convierte entre CSV y Excel (XLSX), en ambas direcciones."
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 7a4464f00f03
---

# CSV a Excel {#csv-to-excel}

Convierte entre los formatos CSV y Excel (XLSX) en ambas direcciones. Sube un archivo CSV o TSV para obtener XLSX, o sube un archivo XLSX para obtener CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

Acepta datos de formulario multipart con un archivo CSV, TSV o XLSX y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| sheet | integer | No | `1` | Número de hoja de cálculo que se exporta al convertir desde XLSX (mín. 1) |

## Ejemplo de solicitud {#example-request}

CSV a Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel a CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## Notas {#notes}

- La dirección de conversión se detecta automáticamente a partir de la extensión del archivo de entrada: `.csv` o `.tsv` produce `.xlsx`, y `.xlsx` produce `.csv`.
- El parámetro `sheet` solo se aplica al convertir desde XLSX. Selecciona qué hoja de cálculo se exporta.
- Los archivos TSV (valores separados por tabuladores) se admiten junto con CSV.
