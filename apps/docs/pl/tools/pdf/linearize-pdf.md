---
description: "Linearyzuj plik PDF, aby szybko wyświetlał się w sieci (pobieranie progresywne)."
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: 6ae5b22ca251
---

# Web-Optimize PDF {#web-optimize-pdf}

Linearyzuj plik PDF, aby mógł być pobierany progresywnie i wyświetlany w przeglądarkach internetowych bez oczekiwania na cały plik.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

Przyjmuje dane formularza multipart z plikiem PDF. Pole `settings` nie jest wymagane.

## Parameters {#parameters}

To narzędzie nie ma parametrów ustawień. Prześlij plik PDF bezpośrednio.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- Linearyzacja zmienia układ wewnętrznej struktury pliku PDF, tak aby pierwsza strona mogła się wyświetlić, zanim cały plik zostanie pobrany.
- Plik wynikowy może być nieznacznie większy od wejściowego z powodu dodanych danych linearyzacji.
- Już zlinearyzowane pliki PDF są ponownie linearyzowane bez problemów.
