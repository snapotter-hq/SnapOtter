---
description: "Elimina de forma permanente apariciones de texto de un PDF (redacción verdadera verificada)."
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: 35213abcef88
---

# Redactar PDF {#redact-pdf}

Elimina de forma permanente las apariciones de texto especificadas de un PDF mediante redacción verdadera verificada. El texto redactado se elimina por completo del archivo, no solo se cubre con un recuadro negro.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| terms | string[] | Sí | - | Cadenas de texto a redactar (1-50 términos, cada uno de hasta 200 caracteres) |
| caseSensitive | boolean | No | `false` | Si la coincidencia distingue entre mayúsculas y minúsculas |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- Formato de entrada aceptado: `.pdf`.
- Esta es una herramienta rápida (síncrona) que devuelve el resultado directamente.
- Esto realiza una redacción verdadera: el texto coincidente se elimina del flujo de contenido del PDF, no solo se oculta visualmente.
- El campo `found` de la respuesta indica cuántas apariciones se redactaron.
- Puedes redactar hasta 50 términos en una sola solicitud.
