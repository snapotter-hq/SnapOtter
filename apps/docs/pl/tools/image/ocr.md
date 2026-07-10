---
description: "Wyodrębniaj tekst z obrazów za pomocą optycznego rozpoznawania znaków wspomaganego AI."
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: 41c5d748cf54
---

# OCR / Wyodrębnianie tekstu {#ocr-text-extraction}

Wyodrębniaj tekst z obrazów za pomocą optycznego rozpoznawania znaków wspomaganego AI. Obsługuje wiele języków i poziomów jakości.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Przetwarzanie:** Synchroniczna odpowiedź JSON. Jeśli podano `clientJobId`, postęp jest też raportowany przez SSE.

**Pakiet modeli:** `ocr` (5-6 GB)

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (multipart) |
| quality | string | Nie | `"balanced"` | Poziom jakości: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | Nie | `"auto"` | Podpowiedź językowa: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | Nie | `true` | Wstępnie przetwórz obraz dla lepszej dokładności OCR |
| engine | string | Nie | - | Przestarzały. Użyj `quality`. Mapuje `tesseract` na `fast`, `paddleocr` na `balanced` |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Odpowiedź (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### Postęp (SSE, opcjonalnie) {#progress-sse-optional}

Jeśli podano pole formularza `clientJobId`, zdarzenia postępu są strumieniowane:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Uwagi {#notes}

- Wymaga zainstalowania pakietu modeli `ocr` (5-6 GB).
- OCR zwraca wyodrębniony tekst bezpośrednio, a nie adres URL do pobrania obrazu.
- Używa łańcucha awaryjnego: jeśli poziom o wyższej jakości ulegnie awarii (np. segfault PaddleOCR), automatycznie ponawia próbę z kolejnym niższym poziomem.
- Jeśli poziom zwróci pusty tekst bez awarii, również przełącza się na kolejny poziom.
- Poziomy jakości mapują się na silniki: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL.
- Obsługuje formaty wejściowe HEIC/HEIF, RAW, TGA, PSD, EXR i HDR poprzez automatyczne dekodowanie.
