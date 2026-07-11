---
description: "Wyodrębnij wybrane strony z pliku PDF do nowego dokumentu."
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: 2a4af5807d98
---

# Extract Pages {#extract-pages}

Wyodrębnij wybrane strony z pliku PDF do nowego, mniejszego dokumentu.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

Przyjmuje dane formularza multipart z plikiem PDF oraz polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| range | string | Yes | - | Zakres stron w składni qpdf, np. `"1-5,8,10-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notes {#notes}

- Zakresy stron używają składni qpdf: `1-5` dla stron od 1 do 5, `z` dla ostatniej strony oraz przecinki do łączenia zakresów (np. `1-3,7,10-z`).
- Wyodrębnione strony zachowują oryginalne formatowanie, adnotacje i odnośniki.
