---
description: "Convierte entre CSV y JSON, en ambas direcciones."
i18n_source_hash: 978c08ad46d3
i18n_provenance: human
i18n_output_hash: 2047c669976f
---

# CSV a JSON {#csv-to-json}

Convierte entre los formatos CSV y JSON en ambas direcciones. Sube un archivo CSV o TSV para obtener un arreglo JSON de objetos, o sube un arreglo JSON para obtener un archivo CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

Acepta datos de formulario multipart con un archivo CSV, TSV o JSON y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | Formatea la salida JSON con sangría |

## Ejemplo de solicitud {#example-request}

CSV a JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON a CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## Notas {#notes}

- La dirección de conversión se detecta automáticamente a partir de la extensión del archivo de entrada: `.csv` o `.tsv` produce `.json`, y `.json` produce `.csv`.
- El parámetro `pretty` solo afecta a la salida JSON. Cuando se establece en `false`, la salida es una cadena JSON compacta de una sola línea.
- La entrada JSON debe ser un arreglo de objetos con claves coherentes. Cada objeto se convierte en una fila y cada clave se convierte en un encabezado de columna.
- Los archivos TSV (valores separados por tabuladores) se admiten junto con CSV.
