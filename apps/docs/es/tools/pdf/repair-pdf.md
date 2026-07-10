---
description: "Intenta reparar un PDF dañado o corrupto."
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: 5fbb898e2e48
---

# Reparar PDF {#repair-pdf}

Intenta reparar un PDF dañado o corrupto reconstruyendo su estructura interna.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

Acepta datos de formulario multipart con un archivo PDF. No se requiere un campo `settings`.

## Parameters {#parameters}

Esta herramienta no tiene parámetros de configuración. Sube el archivo PDF dañado directamente.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- La validación estructural se omite en la entrada para permitir el paso de archivos con formato incorrecto.
- La reparación se hace en la medida de lo posible; los archivos gravemente corruptos pueden no recuperarse por completo.
- El PDF reparado puede diferir ligeramente en tamaño del original debido a la reconstrucción de las tablas de referencias cruzadas.
