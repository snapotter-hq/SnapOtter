---
description: "Combina varios PDF en un único documento."
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: c306fb677b0b
---

# Combinar PDF {#merge-pdfs}

Combina dos o más archivos PDF en un único documento, conservando el orden de las páginas de cada archivo de entrada.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

Acepta datos de formulario multipart con dos o más archivos PDF. No se requiere un campo `settings`.

## Parameters {#parameters}

Esta herramienta no tiene parámetros de configuración. Simplemente sube dos o más archivos PDF.

| Restricción | Valor |
|------------|-------|
| Archivos mínimos | 2 |
| Archivos máximos | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Los archivos se combinan en el orden en que se suben.
- Se requieren al menos dos archivos PDF; la solicitud fallará con un error 400 si se proporcionan menos.
- El número máximo de archivos de entrada es 20.
- Los PDF cifrados deben desbloquearse antes de combinarlos.
