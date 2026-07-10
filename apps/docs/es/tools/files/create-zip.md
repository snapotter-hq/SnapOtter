---
description: "Agrupa varios archivos en un único archivo ZIP."
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: ede5ca205156
---

# Crear ZIP {#create-zip}

Agrupa varios archivos de cualquier tipo en un único archivo ZIP. Los nombres de archivo duplicados se deduplican automáticamente.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

Acepta datos de formulario multipart con dos o más archivos. No se requiere un campo de ajustes.

## Parámetros {#parameters}

Esta herramienta no tiene parámetros configurables. Sube de 2 a 50 archivos de cualquier tipo para agruparlos.

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## Notas {#notes}

- Requiere entre 2 y 50 archivos de entrada.
- Se acepta cualquier tipo de archivo; no hay restricciones sobre el formato de entrada.
- Si varios archivos comparten el mismo nombre, se deduplican automáticamente con sufijos numéricos.
- El archivo de salida usa la compresión ZIP estándar (deflate).
