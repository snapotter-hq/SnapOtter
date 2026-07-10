---
description: "Вбудовує текстовий водяний знак у кадри відео."
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: f08b6357a73a
---

# Watermark Video {#watermark-video}

Вбудовує текстовий водяний знак у кожен кадр відео з налаштовуваним положенням, розміром, непрозорістю та кольором.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

Приймає дані форми multipart із відеофайлом і полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Текст водяного знака (1-200 символів) |
| position | string | No | `"br"` | Положення на кадрі: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `36` | Розмір шрифту в пікселях (8-120) |
| opacity | number | No | `0.5` | Непрозорість водяного знака (0.05-1) |
| color | string | No | `"#ffffff"` | Шістнадцятковий колір тексту (наприклад, `"#ffffff"`) |

### Position Values {#position-values}

- **tl** - Зверху ліворуч, **tc** - Зверху по центру, **tr** - Зверху праворуч
- **l** - По центру ліворуч, **c** - По центру, **r** - По центру праворуч
- **bl** - Знизу ліворуч, **bc** - Знизу по центру, **br** - Знизу праворуч

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- Водяний знак назавжди вбудовується в кадри відео і не може бути видалений після обробки.
- Водяний знак використовує шрифт без засічок, вбудований у FFmpeg.
- Для водяних знаків із зображень використовуйте натомість інструмент Watermark для зображень.
