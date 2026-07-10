---
description: "Extrae texto de imágenes mediante reconocimiento óptico de caracteres con IA."
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: 40269047c35e
---

# OCR / Extracción de texto {#ocr-text-extraction}

Extrae texto de imágenes mediante reconocimiento óptico de caracteres con IA. Admite varios idiomas y niveles de calidad.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Procesamiento:** respuesta JSON síncrona. Si se proporciona `clientJobId`, el progreso también se informa a través de SSE.

**Paquete del modelo:** `ocr` (5-6 GB)

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen (multipart) |
| quality | string | No | `"balanced"` | Nivel de calidad: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | No | `"auto"` | Sugerencia de idioma: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | No | `true` | Preprocesar la imagen para mejorar la precisión del OCR |
| engine | string | No | - | Obsoleto. Usa `quality` en su lugar. Asigna `tesseract` a `fast`, y `paddleocr` a `balanced` |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Respuesta (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### Progreso (SSE, opcional) {#progress-sse-optional}

Si se proporciona un campo de formulario `clientJobId`, los eventos de progreso se transmiten:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Notas {#notes}

- Requiere que el paquete del modelo `ocr` esté instalado (5-6 GB).
- El OCR devuelve el texto extraído directamente en lugar de una URL de descarga de imagen.
- Usa una cadena de reserva: si un nivel de mayor calidad falla (por ejemplo, un segfault de PaddleOCR), reintenta automáticamente con el siguiente nivel inferior.
- Si un nivel devuelve texto vacío sin fallar, también recurre al siguiente nivel.
- Los niveles de calidad se asignan a motores: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL.
- Admite los formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR y HDR mediante decodificación automática.
