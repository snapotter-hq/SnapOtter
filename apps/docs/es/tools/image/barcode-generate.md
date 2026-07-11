---
description: "Genera códigos de barras en los formatos Code 128, EAN-13, UPC-A, Code 39, ITF-14 y Data Matrix."
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: c6f58796c11d
---

# Generador de códigos de barras {#barcode-generator}

Genera imágenes de códigos de barras a partir de texto de entrada. Admite los formatos Code 128, EAN-13, UPC-A, Code 39, ITF-14 y Data Matrix.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

Acepta un cuerpo `application/json` (no multipart). El código de barras se genera a partir del texto proporcionado, no de un archivo subido.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Sí | - | Texto a codificar en el código de barras (1-256 caracteres) |
| type | string | No | `"code128"` | Formato del código de barras: `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | integer | No | `3` | Factor de escala de la imagen (1-8) |
| includeText | boolean | No | `true` | Si se debe mostrar el texto debajo del código de barras |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notes {#notes}

- A diferencia de la mayoría de las herramientas, este endpoint acepta un cuerpo JSON, no datos de formulario multipart, ya que los códigos de barras se generan a partir de texto en lugar de un archivo subido.
- EAN-13 requiere exactamente 12 o 13 dígitos. UPC-A requiere exactamente 11 o 12 dígitos. Si se omite un dígito de control, se calcula automáticamente.
- Code 128 es el formato más flexible y admite el conjunto completo de caracteres ASCII.
- Data Matrix produce un código de barras 2D adecuado para codificar cadenas más largas en un cuadrado compacto.
