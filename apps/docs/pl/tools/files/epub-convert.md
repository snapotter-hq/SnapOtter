---
description: "Konwertuje EPUB na PDF, DOCX, HTML lub Markdown."
i18n_source_hash: cb39f254ff2f
i18n_provenance: human
i18n_output_hash: bb167806f277
---

# Konwertuj z EPUB {#convert-epub}

Konwertuje e-booka EPUB na PDF, Word (DOCX), HTML lub Markdown. Zasoby zdalne wewnątrz książki nie są pobierane.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

Przyjmuje dane formularza multipart z plikiem EPUB oraz polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| format | string | Tak | - | Format wyjściowy: `pdf`, `docx`, `html`, `md` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
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

- Akceptowany format wejściowy: `.epub`.
- Zasoby zdalne osadzone w EPUB (zewnętrzne obrazy, czcionki) nie są pobierane ze względów bezpieczeństwa.
- Wierność obrazów w wyniku konwersji może się różnić w zależności od struktury EPUB.
- Konwersję obsługuje Pandoc na serwerze.
