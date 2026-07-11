---
description: "Estrai testo dalle immagini usando il riconoscimento ottico dei caratteri basato sull'AI."
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: 7203514995bd
---

# OCR / Text Extraction {#ocr-text-extraction}

Estrai testo dalle immagini usando il riconoscimento ottico dei caratteri basato sull'AI. Supporta più lingue e livelli di qualità.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Elaborazione:** Risposta JSON sincrona. Se viene fornito `clientJobId`, l'avanzamento viene riportato anche tramite SSE.

**Bundle del modello:** `ocr` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | File immagine (multipart) |
| quality | string | No | `"balanced"` | Livello di qualità: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | No | `"auto"` | Suggerimento sulla lingua: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | No | `true` | Pre-elabora l'immagine per una migliore accuratezza dell'OCR |
| engine | string | No | - | Deprecato. Usa `quality` al suo posto. Mappa `tesseract` a `fast`, `paddleocr` a `balanced` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### Progress (SSE, optional) {#progress-sse-optional}

Se viene fornito un campo form `clientJobId`, gli eventi di avanzamento vengono trasmessi in streaming:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Notes {#notes}

- Richiede l'installazione del bundle del modello `ocr` (5-6 GB).
- L'OCR restituisce direttamente il testo estratto anziché un URL di download dell'immagine.
- Usa una catena di fallback: se un livello di qualità più alto va in crash (ad es. un segfault di PaddleOCR), riprova automaticamente con il livello inferiore successivo.
- Se un livello restituisce testo vuoto senza andare in crash, ricade comunque sul livello successivo.
- I livelli di qualità si mappano sui motori: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL.
- Supporta i formati di input HEIC/HEIF, RAW, TGA, PSD, EXR e HDR tramite decodifica automatica.
