---
description: "Combina varios archivos CSV o TSV con columnas coincidentes en uno solo."
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: 3e8348a37bf3
---

# Combinar CSV {#merge-csvs}

Combina varios archivos CSV o TSV con columnas coincidentes en un único archivo fusionado. Todos los archivos de entrada deben tener los mismos encabezados de columna.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

Acepta datos de formulario multipart con dos o más archivos CSV. No se requiere ningún campo de configuración.

## Parameters {#parameters}

Esta herramienta no tiene parámetros configurables. Sube de 2 a 20 archivos CSV o TSV con encabezados de columna coincidentes.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Notes {#notes}

- Requiere entre 2 y 20 archivos de entrada.
- Todos los archivos deben compartir los mismos encabezados de columna. La combinación fallará si las columnas no coinciden.
- La fila de encabezado se incluye una sola vez en la salida; las filas de datos de todos los archivos se concatenan en el orden de subida.
- Se aceptan tanto archivos CSV como TSV, pero todos los archivos de una misma solicitud deben usar el mismo delimitador.
