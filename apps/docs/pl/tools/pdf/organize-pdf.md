---
description: "Zmień kolejność stron w pliku PDF, podając jawną kolejność stron."
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: 9f7eabfc482b
---

# Organize PDF {#organize-pdf}

Zmień kolejność stron w pliku PDF, podając żądaną sekwencję stron.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

Przyjmuje dane formularza multipart z plikiem PDF oraz polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| order | string | Yes | - | Żądana kolejność stron w składni qpdf, np. `"3,1,2,5-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Zakresy stron używają składni qpdf: `3,1,2` zmienia kolejność pierwszych trzech stron, a `5-z` dołącza strony od 5 do ostatniej.
- Strony można powielać, wymieniając je więcej niż raz (np. `"1,1,2,3"` powiela stronę 1).
- Strony niewymienione w łańcuchu kolejności są pomijane w wyniku.
