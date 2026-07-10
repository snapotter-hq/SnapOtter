---
description: "Wyodrębnij tekst z dokumentów PDF za pomocą OCR opartego na AI."
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: 7cd3408b836e
---

# PDF OCR {#pdf-ocr}

Wyodrębnij tekst z dokumentów PDF za pomocą optycznego rozpoznawania znaków (OCR) opartego na AI. Obsługuje wiele poziomów jakości i języków. Wymaga zainstalowania pakietu funkcji OCR.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Przyjmuje dane formularza multipart z plikiem PDF oraz opcjonalnym polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | Poziom jakości OCR: `fast`, `balanced`, `best` |
| language | string | No | `"auto"` | Język dokumentu: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | No | `"all"` | Wybór stron, np. `"all"`, `"1-3"`, `"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
```

## Example Response {#example-response}

Zwraca `202 Accepted`. Śledź postęp przez SSE pod `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Akceptowany format wejściowy: `.pdf`.
- To narzędzie AI, które wymaga zainstalowania **pakietu funkcji OCR**. Jeśli pakiet nie jest zainstalowany, API zwraca `501 Not Implemented`.
- Poziom jakości `fast` używa lżejszego modelu do szybszego przetwarzania; `best` używa dokładniejszego modelu kosztem szybkości.
- Ustawienie języka `auto` próbuje automatycznie wykryć język dokumentu.
- Możesz wskazać konkretne strony za pomocą zakresów (`"1-3"`), list rozdzielonych przecinkami (`"1,3,5"`) lub `"all"` dla każdej strony.
- W przypadku plików PDF, które już zawierają zaznaczalny tekst, rozważ użycie szybszego narzędzia [PDF to Text](./pdf-to-text).
