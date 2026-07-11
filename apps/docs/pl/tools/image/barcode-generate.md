---
description: "Generuj kody kreskowe w formatach Code 128, EAN-13, UPC-A, Code 39, ITF-14 i Data Matrix."
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: 8cf4c56ce48d
---

# Generator kodów kreskowych {#barcode-generator}

Generuj obrazy kodów kreskowych z wprowadzonego tekstu. Obsługuje formaty Code 128, EAN-13, UPC-A, Code 39, ITF-14 i Data Matrix.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

Przyjmuje treść `application/json` (nie multipart). Kod kreskowy jest generowany z podanego tekstu, a nie z przesłanego pliku.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| text | string | Tak | - | Tekst do zakodowania w kodzie kreskowym (1-256 znaków) |
| type | string | Nie | `"code128"` | Format kodu kreskowego: `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | integer | Nie | `3` | Współczynnik skali obrazu (1-8) |
| includeText | boolean | Nie | `true` | Czy renderować tekst pod kodem kreskowym |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Uwagi {#notes}

- W przeciwieństwie do większości narzędzi ten punkt końcowy przyjmuje treść JSON, a nie dane formularza multipart, ponieważ kody kreskowe są generowane z tekstu, a nie z przesłanego pliku.
- EAN-13 wymaga dokładnie 12 lub 13 cyfr. UPC-A wymaga dokładnie 11 lub 12 cyfr. Jeśli cyfra kontrolna zostanie pominięta, jest obliczana automatycznie.
- Code 128 jest najbardziej elastycznym formatem i obsługuje pełny zestaw znaków ASCII.
- Data Matrix tworzy dwuwymiarowy kod kreskowy odpowiedni do kodowania dłuższych ciągów w zwartym kwadracie.
