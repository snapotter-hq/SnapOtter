---
description: "Lee y escribe los metadatos de un documento PDF."
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: efe7229a5ae8
---

# Metadatos de PDF {#pdf-metadata}

Lee y actualiza los campos de metadatos de un documento PDF, como el título, el autor, el asunto y las palabras clave. Cuando no se proporciona ninguna configuración, se devuelven los metadatos existentes sin modificarlos.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings` opcional.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| title | string | No | - | Título del documento (máximo 500 caracteres) |
| author | string | No | - | Autor del documento (máximo 500 caracteres) |
| subject | string | No | - | Asunto del documento (máximo 500 caracteres) |
| keywords | string | No | - | Palabras clave del documento (máximo 500 caracteres) |

Todos los parámetros son opcionales. Los campos omitidos se dejan sin cambios.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Formato de entrada aceptado: `.pdf`.
- Esta es una herramienta rápida (síncrona) que devuelve el resultado directamente.
- El campo `metadata` de la respuesta contiene los metadatos resultantes tras cualquier actualización.
- Para leer los metadatos sin modificarlos, omite el campo `settings` o envía un objeto vacío.
- Cada campo de metadatos está limitado a 500 caracteres.
