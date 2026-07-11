---
description: "Obróć strony w pliku PDF o 90, 180 lub 270 stopni."
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: d5aecfa9136f
---

# Rotate PDF {#rotate-pdf}

Obróć wszystkie lub wybrane strony w pliku PDF o określony kąt.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

Przyjmuje dane formularza multipart z plikiem PDF oraz polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | integer | No | `90` | Kąt obrotu: `90`, `180` lub `270` |
| range | string | No | `"1-z"` | Zakres stron w składni qpdf, np. `"1-5,8"` (`"1-z"` = wszystkie strony) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
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

- Obrót odbywa się zgodnie z ruchem wskazówek zegara.
- Zakresy stron używają składni qpdf: `1-5` dla stron od 1 do 5, `z` dla ostatniej strony oraz przecinki do łączenia zakresów.
- Domyślny zakres `"1-z"` obraca wszystkie strony.
