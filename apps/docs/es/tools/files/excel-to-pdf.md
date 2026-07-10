---
description: "Convierte hojas de cálculo a PDF."
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: 16804a39f265
---

# Excel a PDF {#excel-to-pdf}

Convierte hojas de cálculo de Excel, OpenDocument o CSV a PDF. Las hojas anchas pueden paginarse en varias páginas.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

Acepta datos de formulario multipart con un archivo Excel/ODS/CSV.

## Parámetros {#parameters}

Esta herramienta no tiene parámetros configurables. Sube una hoja de cálculo y se convertirá a PDF.

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
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
- Las hojas anchas pueden dividirse en varias páginas en el PDF resultante.
- Los gráficos y el formato condicional se renderizan en la salida PDF.
- La conversión la gestiona LibreOffice ejecutándose sin interfaz gráfica en el servidor.
