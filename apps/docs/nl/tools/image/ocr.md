---
description: "Haal tekst uit afbeeldingen met AI-aangedreven optische tekenherkenning."
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: 0afde125f65e
---

# OCR / Text Extraction {#ocr-text-extraction}

Haal tekst uit afbeeldingen met AI-aangedreven optische tekenherkenning. Ondersteunt meerdere talen en kwaliteitsniveaus.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Verwerking:** Synchrone JSON-respons. Als `clientJobId` is opgegeven, wordt de voortgang ook via SSE gerapporteerd.

**Modelbundel:** `ocr` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Afbeeldingsbestand (multipart) |
| quality | string | Nee | `"balanced"` | Kwaliteitsniveau: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | Nee | `"auto"` | Taalhint: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | Nee | `true` | Afbeelding voorbewerken voor betere OCR-nauwkeurigheid |
| engine | string | Nee | - | Verouderd. Gebruik in plaats daarvan `quality`. Wijst `tesseract` toe aan `fast`, `paddleocr` aan `balanced` |

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

Als een `clientJobId`-formulierveld is opgegeven, worden voortgangsgebeurtenissen gestreamd:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Notes {#notes}

- Vereist dat de modelbundel `ocr` is geïnstalleerd (5-6 GB).
- OCR geeft de geëxtraheerde tekst rechtstreeks terug in plaats van een download-URL voor een afbeelding.
- Gebruikt een fallback-keten: als een hoger kwaliteitsniveau vastloopt (bijv. een PaddleOCR-segfault), wordt automatisch opnieuw geprobeerd met het eerstvolgende lagere niveau.
- Als een niveau lege tekst teruggeeft zonder vast te lopen, valt het ook terug op het volgende niveau.
- Kwaliteitsniveaus komen overeen met engines: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL.
- Ondersteunt de invoerformaten HEIC/HEIF, RAW, TGA, PSD, EXR en HDR via automatische decodering.
