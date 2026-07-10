---
description: "Dodaj tekstowy znak wodny do każdej strony pliku PDF."
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: b9a264bf9d71
---

# Watermark PDF {#watermark-pdf}

Nanieś tekstowy znak wodny na każdą stronę pliku PDF z konfigurowalną pozycją, rozmiarem, przezroczystością i obrotem.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

Przyjmuje dane formularza multipart z plikiem PDF oraz polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Tekst znaku wodnego (1-200 znaków) |
| position | string | No | `"c"` | Umieszczenie na stronie: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `48` | Rozmiar czcionki w punktach (6-72) |
| opacity | number | No | `0.3` | Przezroczystość znaku wodnego (0.05-1) |
| rotation | number | No | `45` | Kąt obrotu w stopniach (-180 do 180) |

### Position Values {#position-values}

- `tl` lewy górny, `tc` górny środek, `tr` prawy górny
- `l` środkowy lewy, `c` środek, `r` środkowy prawy
- `bl` lewy dolny, `bc` dolny środek, `br` prawy dolny

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- Znak wodny jest renderowany jako nakładka tekstowa na każdej stronie.
- Ten sam tekst, pozycja i styl znaku wodnego są stosowane jednolicie do wszystkich stron.
- Użyj niższych wartości przezroczystości (0.1-0.3) dla subtelnych znaków wodnych, które nie zasłaniają treści.
