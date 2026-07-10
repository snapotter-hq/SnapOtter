---
description: "Convierte todos los colores de un PDF a escala de grises."
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: af7cf81a5664
---

# PDF en escala de grises {#grayscale-pdf}

Convierte todos los colores de un PDF a escala de grises, produciendo una versión en blanco y negro del documento.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

Acepta datos de formulario multipart con un archivo PDF. No se requiere un campo `settings`.

## Parameters {#parameters}

Esta herramienta no tiene parámetros de configuración. Sube el archivo PDF directamente.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Todos los espacios de color (RGB, CMYK) se convierten a escala de grises, incluidas las imágenes incrustadas, los gráficos vectoriales y el texto.
- El archivo de salida suele ser más pequeño que el original porque los datos en escala de grises requieren menos bytes por píxel.
