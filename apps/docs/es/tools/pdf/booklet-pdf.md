---
description: "Ordena las páginas de un PDF para plegarlas y formar un folleto."
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: 2afc377fa975
---

# Folleto PDF {#booklet-pdf}

Impone las páginas para la impresión a doble cara de modo que las hojas impresas puedan plegarse para formar un folleto.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

Acepta datos de formulario multipart con un archivo PDF y un campo `settings` en JSON.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | Páginas por hoja: `2`, `4`, `6` o `8` |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notas {#notes}

- El valor predeterminado `perSheet: 2` coloca dos páginas una al lado de la otra en cada hoja, que es el diseño de folleto estándar para la impresión a doble cara.
- Se añaden páginas en blanco automáticamente si el número total de páginas no es múltiplo del tamaño de la hoja.
- Imprime la salida a doble cara con encuadernación por el borde corto, luego pliega y grapa.
