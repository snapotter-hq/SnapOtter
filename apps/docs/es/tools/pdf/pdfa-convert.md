---
description: "Convierte un PDF al formato de archivado PDF/A-2 para su conservación a largo plazo."
i18n_source_hash: 4c6bf7a12e84
i18n_provenance: human
i18n_output_hash: 76fc2834a22d
---

# Convertir a PDF/A {#pdf-a-convert}

Convierte un PDF al formato de archivado PDF/A-2, adecuado para la conservación a largo plazo y el cumplimiento normativo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

Acepta datos de formulario multipart con un archivo PDF. No se requiere un campo `settings`.

## Parameters {#parameters}

Esta herramienta no tiene parámetros de configuración. Sube el archivo PDF directamente.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notes {#notes}

- La salida cumple con el estándar PDF/A-2.
- PDF/A incrusta todas las fuentes y prohíbe las referencias externas, por lo que el archivo de salida puede ser más grande que el original.
- El cifrado y JavaScript se eliminan durante la conversión, ya que no están permitidos por el estándar PDF/A.
