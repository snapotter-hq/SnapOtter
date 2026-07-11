---
description: "Lineariza un PDF para una visualización web rápida (descarga progresiva)."
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: ff913c2044cf
---

# Optimizar PDF para web {#web-optimize-pdf}

Lineariza un PDF para que pueda descargarse y mostrarse progresivamente en los navegadores web sin esperar al archivo completo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

Acepta datos de formulario multipart con un archivo PDF. No se requiere un campo `settings`.

## Parameters {#parameters}

Esta herramienta no tiene parámetros de configuración. Sube el archivo PDF directamente.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- La linearización reorganiza la estructura interna del PDF para que la primera página pueda renderizarse antes de que se haya descargado el archivo completo.
- El archivo de salida puede ser ligeramente más grande que la entrada debido a los datos de linearización añadidos.
- Los PDF ya linearizados se vuelven a linearizar sin problemas.
