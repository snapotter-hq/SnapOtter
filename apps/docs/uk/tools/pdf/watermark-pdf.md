---
description: "Додавання текстового водяного знака на кожну сторінку PDF."
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: ebff0ed3a697
---

# Watermark PDF {#watermark-pdf}

Штампуйте текстовий водяний знак на кожну сторінку PDF з налаштовуваними позицією, розміром, непрозорістю та обертанням.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

Приймає багаточастинні (multipart) дані форми з файлом PDF та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Текст водяного знака (1-200 символів) |
| position | string | No | `"c"` | Розміщення на сторінці: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `48` | Розмір шрифту в пунктах (6-72) |
| opacity | number | No | `0.3` | Непрозорість водяного знака (0.05-1) |
| rotation | number | No | `45` | Кут обертання в градусах (від -180 до 180) |

### Position Values {#position-values}

- `tl` угорі ліворуч, `tc` угорі по центру, `tr` угорі праворуч
- `l` по центру ліворуч, `c` по центру, `r` по центру праворуч
- `bl` внизу ліворуч, `bc` внизу по центру, `br` внизу праворуч

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

- Водяний знак відображається як текстове накладання на кожній сторінці.
- Той самий текст, позиція та стиль водяного знака застосовуються однаково до всіх сторінок.
- Використовуйте нижчі значення непрозорості (0.1-0.3) для ненав'язливих водяних знаків, які не приховують вміст.
