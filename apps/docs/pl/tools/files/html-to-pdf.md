---
description: "Konwertuje plik HTML na PDF."
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: c847ece23f89
---

# HTML to PDF {#html-to-pdf}

Konwertuje plik HTML na sformatowany dokument PDF. Zasoby zdalne (zewnętrzne obrazy, arkusze stylów, skrypty) są wyłączone ze względu na prywatność.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

Przyjmuje dane formularza multipart z plikiem HTML.

## Parameters {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Prześlij plik HTML, a zostanie on przekonwertowany na PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
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

- Akceptowane formaty wejściowe: `.html`, `.htm`.
- Zasoby zdalne (obrazy, arkusze stylów, skrypty wskazywane przez adresy URL) nie są pobierane ze względów prywatności i bezpieczeństwa.
- Style wpisane bezpośrednio i osadzone obrazy (data URI) są zachowywane.
- Konwersję obsługuje WeasyPrint na serwerze.
