---
description: "Wyodrębnij strony lub podziel plik PDF na części."
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: 66e151fbfd48
---

# Split PDF {#split-pdf}

Wyodrębnij zakres stron do nowego pliku PDF lub podziel dokument na fragmenty po N stron.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

Przyjmuje dane formularza multipart z plikiem PDF oraz polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"range"` | Tryb podziału: `range` lub `every` |
| range | string | Gdy mode to `range` | - | Zakres stron w składni qpdf, np. `"1-5,8,10-z"` |
| everyN | integer | Gdy mode to `every` | - | Podział na fragmenty po N stron (1-500) |

## Example Request {#example-request}

Wyodrębnij wybrane strony:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

Podział na fragmenty po 10 stron:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- W trybie `range` zwracany jest pojedynczy plik PDF zawierający wybrane strony.
- W trybie `every` wynikiem jest archiwum ZIP zawierające poszczególne części.
- Zakresy stron używają składni qpdf: `1-5` dla stron od 1 do 5, `z` dla ostatniej strony oraz przecinki do łączenia zakresów (np. `1-3,7,10-z`).
