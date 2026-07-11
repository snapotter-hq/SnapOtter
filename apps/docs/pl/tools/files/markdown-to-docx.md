---
description: "Konwertuje plik Markdown na dokument Word (DOCX)."
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: 3413daef846a
---

# Markdown to Word {#markdown-to-word}

Konwertuje plik Markdown na dokument Word (DOCX), zachowując nagłówki, listy, bloki kodu i inne formatowanie.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

Przyjmuje dane formularza multipart z plikiem Markdown.

## Parameters {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Prześlij plik Markdown, a zostanie on przekonwertowany na DOCX.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Notes {#notes}

- Akceptowane formaty wejściowe: `.md`, `.markdown`.
- To szybkie (synchroniczne) narzędzie, które zwraca wynik bezpośrednio.
- Nagłówki, pogrubienie, kursywa, linki, bloki kodu i listy są mapowane na style Word.
- Konwersję obsługuje Pandoc na serwerze.
