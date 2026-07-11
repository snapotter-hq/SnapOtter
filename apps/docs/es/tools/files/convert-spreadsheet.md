---
description: "Convierte entre los formatos Excel, OpenDocument y CSV."
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: 0b8010ae788d
---

# Convertir hoja de cálculo {#convert-spreadsheet}

Convierte hojas de cálculo entre los formatos Excel (XLSX), OpenDocument Spreadsheet (ODS) y CSV. Los libros con varias hojas exportan la primera hoja al convertir a CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

Acepta datos de formulario multipart con un archivo Excel/ODS/CSV y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| format | string | Sí | - | Formato de salida: `xlsx`, `ods`, `csv` |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
```

## Ejemplo de respuesta {#example-response}

Devuelve `202 Accepted`. Sigue el progreso mediante SSE en `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notas {#notes}

- Formatos de entrada aceptados: `.xlsx`, `.xls`, `.ods`, `.csv`.
- Al convertir un libro con varias hojas a CSV, solo se exporta la primera hoja.
- Las fórmulas se evalúan y se exportan como valores estáticos en la salida CSV.
- El formato de salida debe ser distinto del formato de entrada.
