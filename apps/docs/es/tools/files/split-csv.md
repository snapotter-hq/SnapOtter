---
description: "Divide un CSV en archivos más pequeños según el número de filas."
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: 01b93cef469b
---

# Dividir CSV {#split-csv}

Divide un archivo CSV o TSV grande en archivos más pequeños según el número de filas. Devuelve un archivo ZIP que contiene las partes.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

Acepta datos de formulario multipart con un archivo CSV y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | No | `1000` | Número de filas de datos por archivo de salida (1-1.000.000) |
| keepHeader | boolean | No | `true` | Repetir la fila de encabezado en cada archivo de salida |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Notes {#notes}

- La salida siempre es un archivo ZIP que contiene las partes del CSV dividido, nombradas secuencialmente (por ejemplo, `part-1.csv`, `part-2.csv`).
- Cuando `keepHeader` es `true`, cada parte incluye la fila de encabezado original para que cada archivo pueda usarse de forma independiente.
- Se aceptan tanto archivos CSV como TSV de entrada.
- El número de filas se refiere solo a las filas de datos; la fila de encabezado no se cuenta.
