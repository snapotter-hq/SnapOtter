---
description: "Extrahiere Text aus Bildern mit KI-gestützter optischer Zeichenerkennung."
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: b3aac06f2306
---

# OCR / Textextraktion {#ocr-text-extraction}

Extrahiere Text aus Bildern mit KI-gestützter optischer Zeichenerkennung. Unterstützt mehrere Sprachen und Qualitätsstufen.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Verarbeitung:** Synchrone JSON-Antwort. Wenn `clientJobId` angegeben ist, wird der Fortschritt zusätzlich über SSE gemeldet.

**Modell-Bundle:** `ocr` (5-6 GB)

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bilddatei (multipart) |
| quality | string | Nein | `"balanced"` | Qualitätsstufe: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | Nein | `"auto"` | Sprachhinweis: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | Nein | `true` | Bild für bessere OCR-Genauigkeit vorverarbeiten |
| engine | string | Nein | - | Veraltet. Verwende stattdessen `quality`. Bildet `tesseract` auf `fast` und `paddleocr` auf `balanced` ab |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Antwort (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### Fortschritt (SSE, optional) {#progress-sse-optional}

Wenn ein Formularfeld `clientJobId` angegeben ist, werden Fortschrittsereignisse gestreamt:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Hinweise {#notes}

- Erfordert das installierte Modell-Bundle `ocr` (5-6 GB).
- OCR gibt den extrahierten Text direkt zurück statt einer Download-URL für ein Bild.
- Verwendet eine Fallback-Kette: Wenn eine höhere Qualitätsstufe abstürzt (z. B. PaddleOCR-Segfault), wird automatisch mit der nächstniedrigeren Stufe erneut versucht.
- Wenn eine Stufe leeren Text ohne Absturz zurückgibt, wird ebenfalls auf die nächste Stufe zurückgegriffen.
- Qualitätsstufen werden auf Engines abgebildet: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL.
- Unterstützt die Eingabeformate HEIC/HEIF, RAW, TGA, PSD, EXR und HDR durch automatische Dekodierung.
