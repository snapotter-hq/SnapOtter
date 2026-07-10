---
description: "Escanea imágenes en busca de códigos QR, códigos de barras y códigos 2D con salida anotada."
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: 439dff4bfa27
---

# Lector de códigos de barras {#barcode-reader}

Escanea las imágenes subidas en busca de todo tipo de códigos de barras y códigos QR. Devuelve el texto decodificado, el tipo de código de barras y los datos de posición de cada código detectado. También genera una imagen anotada con recuadros de color alrededor de los códigos detectados.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings` opcional.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | No | `true` | Habilita el modo de escaneo agresivo para códigos de barras más difíciles de leer (más lento pero más exhaustivo) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Example Response {#example-response}

```json
{
  "filename": "receipt.jpg",
  "barcodes": [
    {
      "type": "QRCode",
      "text": "https://example.com/product/123",
      "position": {
        "topLeft": { "x": 100, "y": 50 },
        "topRight": { "x": 250, "y": 50 },
        "bottomLeft": { "x": 100, "y": 200 },
        "bottomRight": { "x": 250, "y": 200 }
      }
    },
    {
      "type": "EAN-13",
      "text": "5901234123457",
      "position": {
        "topLeft": { "x": 50, "y": 400 },
        "topRight": { "x": 300, "y": 400 },
        "bottomLeft": { "x": 50, "y": 450 },
        "bottomRight": { "x": 300, "y": 450 }
      }
    }
  ],
  "annotatedUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png"
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | Nombre de archivo original |
| barcodes | array | Array de objetos de código de barras detectados |
| annotatedUrl | string o null | URL para descargar la imagen anotada (null si no se encuentran códigos de barras) |
| previewUrl | string o null | Igual que annotatedUrl (para compatibilidad con la previsualización del frontend) |

### Barcode Object {#barcode-object}

| Field | Type | Description |
|-------|------|-------------|
| type | string | Formato del código de barras (QRCode, EAN-13, Code128, DataMatrix, PDF417, etc.) |
| text | string | Contenido decodificado del código de barras |
| position | object | Recuadro delimitador con coordenadas topLeft, topRight, bottomLeft, bottomRight |

## Supported Barcode Types {#supported-barcode-types}

Códigos de barras 1D: Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

Códigos de barras 2D: QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## Notes {#notes}

- Usa la biblioteca zxing-wasm para la detección de códigos de barras.
- La imagen anotada superpone recuadros poligonales de color y etiquetas numeradas sobre cada código de barras detectado.
- Se pueden detectar hasta 255 códigos de barras en una sola imagen.
- Si no se encuentran códigos de barras, `barcodes` es un array vacío y `annotatedUrl` es null.
- El modo `tryHarder` realiza un escaneo más exhaustivo a costa del tiempo de procesamiento. Deshabilítalo para procesar más rápido códigos de barras limpios y bien alineados.
- La salida anotada siempre está en formato PNG.
- Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del escaneo.
- La orientación EXIF se aplica automáticamente antes del procesamiento.
