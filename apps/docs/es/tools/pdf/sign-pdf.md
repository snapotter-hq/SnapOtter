---
description: "Estampa imágenes de firma subidas en un PDF mediante ubicaciones de página normalizadas."
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: d08f122592a0
---

# Firmar PDF {#sign-pdf}

Estampa una o varias imágenes PNG de firma subidas en cualquier página de un PDF. Esta ruta usa un contrato multipart personalizado porque necesita el PDF, una o varias imágenes de firma y las coordenadas de ubicación.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

Acepta datos de formulario multipart. El PDF se envía como `file`; las firmas se envían como `sig0`, `sig1`, y así sucesivamente; las ubicaciones se envían en un campo JSON `placements`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo PDF a firmar |
| sig0 | file | Sí | - | Primera imagen de firma. Las imágenes adicionales usan `sig1`, `sig2`, y así sucesivamente |
| placements | JSON string | Sí | - | Array de objetos de ubicación: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | No | - | UUID opcional para el seguimiento del progreso mediante SSE |
| fileId | string | No | - | ID opcional de la biblioteca de archivos para guardar el resultado firmado como una nueva versión |

## Coordenadas de ubicación {#placement-coordinates}

| Campo | Tipo | Descripción |
|-------|------|-------------|
| sig | integer | Índice de la imagen de firma. `0` se asigna a `sig0` |
| page | integer | Índice de página del PDF basado en cero |
| x | number | Posición izquierda como fracción de la página |
| y | number | Posición superior como fracción de la página |
| w | number | Ancho de la firma como fracción de la página |
| h | number | Alto de la firma como fracción de la página |

Las coordenadas usan un origen en la esquina superior izquierda. Los valores pueden sobresalir ligeramente del borde de la página; el renderizador de PDF recorta el sello final a la página.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

Si la solicitud no puede completarse dentro de la ventana de espera síncrona, la API devuelve:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Conéctate a `/api/v1/jobs/<jobId>/progress` y descarga el resultado cuando el trabajo se complete.

## Notes {#notes}

- Formato de entrada PDF aceptado: `.pdf`.
- Las imágenes de firma deben ser archivos de imagen válidos, normalmente PNG con transparencia.
- Se aceptan hasta 100 imágenes de firma y 100 ubicaciones.
- `sign-pdf` es una ruta personalizada y no usa el campo JSON `settings` estándar de la herramienta.
