---
description: "Konwertuje plik Markdown na samodzielną stronę HTML."
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: 8e2575f6b60b
---

# Markdown to HTML {#markdown-to-html}

Konwertuje plik Markdown na samodzielną stronę HTML. Zdalne obrazy wskazywane w źródle pozostają w wyniku bez zmian.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

Przyjmuje dane formularza multipart z plikiem Markdown.

## Parameters {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Prześlij plik Markdown, a zostanie on przekonwertowany na HTML.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Notes {#notes}

- Akceptowane formaty wejściowe: `.md`, `.markdown`.
- To szybkie (synchroniczne) narzędzie, które zwraca wynik bezpośrednio.
- Wynikiem jest samodzielna strona HTML ze stylami wpisanymi bezpośrednio.
- Zdalne adresy URL obrazów w źródle Markdown są zachowywane bez zmian i nie są pobierane.
