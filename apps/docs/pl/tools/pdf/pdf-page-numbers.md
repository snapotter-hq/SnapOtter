---
description: "Dodaj numery stron do każdej strony pliku PDF."
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: 4bf44240d58d
---

# PDF Page Numbers {#pdf-page-numbers}

Dodaj numery stron w formacie „Page N of M” do każdej strony pliku PDF.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

Przyjmuje dane formularza multipart z plikiem PDF oraz polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bc"` | Umieszczenie numeru strony: `bl`, `bc`, `br`, `tl`, `tc`, `tr` |
| fontSize | integer | No | `10` | Rozmiar czcionki w punktach (6-24) |

### Position Values {#position-values}

- `tl` lewy górny, `tc` górny środek, `tr` prawy górny
- `bl` lewy dolny, `bc` dolny środek, `br` prawy dolny

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- Numery stron są renderowane w formacie „Page 1 of 10”.
- Numery są dodawane do każdej strony, w tym do istniejących stron tytułowych lub okładek.
- Domyślna pozycja `"bc"` umieszcza numery na dole na środku każdej strony.
