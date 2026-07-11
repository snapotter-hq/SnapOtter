---
description: "Usuń wybrane strony z pliku PDF."
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: a07b37cb31bb
---

# Remove Pages {#remove-pages}

Usuń wybrane strony z pliku PDF, zachowując wszystkie pozostałe strony nienaruszone.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

Przyjmuje dane formularza multipart z plikiem PDF oraz polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pages | string | Yes | - | Zakres stron do usunięcia w składni qpdf, np. `"3,5-7"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- Nie można usunąć wszystkich stron z dokumentu; musi pozostać co najmniej jedna strona.
- Zakresy stron używają składni qpdf: `3` dla pojedynczej strony, `5-7` dla zakresu oraz przecinki do łączenia (np. `1,3,5-7`).
