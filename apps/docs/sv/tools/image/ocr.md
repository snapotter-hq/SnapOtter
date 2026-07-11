---
description: "Extrahera text från bilder med AI-driven optisk teckenigenkänning."
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: 446bffa09bca
---

# OCR / Textextrahering {#ocr-text-extraction}

Extrahera text från bilder med AI-driven optisk teckenigenkänning. Stöder flera språk och kvalitetsnivåer.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Bearbetning:** Synkront JSON-svar. Om `clientJobId` anges rapporteras förloppet även via SSE.

**Modellpaket:** `ocr` (5-6 GB)

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bildfil (multipart) |
| quality | string | Nej | `"balanced"` | Kvalitetsnivå: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | Nej | `"auto"` | Språktips: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | Nej | `true` | Förbehandla bilden för bättre OCR-noggrannhet |
| engine | string | Nej | - | Föråldrad. Använd `quality` istället. Mappar `tesseract` till `fast`, `paddleocr` till `balanced` |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Svar (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### Förlopp (SSE, valfritt) {#progress-sse-optional}

Om ett formulärfält `clientJobId` anges strömmas förloppshändelser:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Anteckningar {#notes}

- Kräver att modellpaketet `ocr` är installerat (5-6 GB).
- OCR returnerar den extraherade texten direkt istället för en nedladdnings-URL för en bild.
- Använder en fallback-kedja: om en nivå med högre kvalitet kraschar (t.ex. PaddleOCR-segfault) försöker den automatiskt igen med nästa lägre nivå.
- Om en nivå returnerar tom text utan att krascha faller den också tillbaka till nästa nivå.
- Kvalitetsnivåer mappas till motorer: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL.
- Stöder HEIC/HEIF-, RAW-, TGA-, PSD-, EXR- och HDR-indataformat via automatisk avkodning.
