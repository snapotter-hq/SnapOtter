---
description: "Wtop formularze i adnotacje w treść strony."
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: 7c9264264ad4
---

# Flatten PDF {#flatten-pdf}

Wtop interaktywne pola formularzy i adnotacje w treść strony, tworząc statyczny plik PDF wyglądający tak samo wszędzie.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

Przyjmuje dane formularza multipart z plikiem PDF.

## Parameters {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Prześlij plik PDF, a wszystkie formularze i adnotacje zostaną spłaszczone.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Notes {#notes}

- Akceptowany format wejściowy: `.pdf`.
- To szybkie (synchroniczne) narzędzie, które zwraca wynik bezpośrednio.
- Wartości pól formularza są zachowywane jako statyczny tekst w pliku wynikowym.
- Adnotacje (komentarze, wyróżnienia, notatki) stają się częścią treści strony i nie można ich już edytować.
