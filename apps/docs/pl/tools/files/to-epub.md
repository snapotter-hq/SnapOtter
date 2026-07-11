---
description: "Konwertuj pliki Word, Markdown, HTML lub zwykły tekst na EPUB."
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: 9ab7f0e09af2
---

# Konwertuj na EPUB {#convert-to-epub}

Konwertuj dokumenty Word, Markdown, HTML lub pliki zwykłego tekstu na format e-booka EPUB.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

Przyjmuje dane formularza multipart z plikiem Word/Markdown/HTML/TXT.

## Parametry {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Prześlij dokument, a zostanie on przekonwertowany na EPUB.

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
```

## Przykładowa odpowiedź {#example-response}

Zwraca `202 Accepted`. Śledź postęp przez SSE pod `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Uwagi {#notes}

- Akceptowane formaty wejściowe: `.docx`, `.md`, `.html`, `.txt`.
- Wynik EPUB jest zgodny ze specyfikacją EPUB 3.
- Nagłówki w dokumencie źródłowym służą do wygenerowania spisu treści.
- Konwersję obsługuje Pandoc na serwerze.
