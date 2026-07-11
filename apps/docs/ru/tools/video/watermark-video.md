---
description: "Встраивание текстового водяного знака в кадры видео."
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: 12b129e357eb
---

# Watermark Video {#watermark-video}

Встраивание текстового водяного знака в каждый кадр видео с настраиваемым положением, размером, непрозрачностью и цветом.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

Принимает multipart form data с файлом видео и полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Текст водяного знака (1-200 символов) |
| position | string | No | `"br"` | Положение на кадре: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `36` | Размер шрифта в пикселях (8-120) |
| opacity | number | No | `0.5` | Непрозрачность водяного знака (0.05-1) |
| color | string | No | `"#ffffff"` | Цвет текста в формате hex (например, `"#ffffff"`) |

### Position Values {#position-values}

- **tl** - Сверху слева, **tc** - Сверху по центру, **tr** - Сверху справа
- **l** - По центру слева, **c** - По центру, **r** - По центру справа
- **bl** - Снизу слева, **bc** - Снизу по центру, **br** - Снизу справа

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

- Водяной знак постоянно встраивается в кадры видео и не может быть удалён после обработки.
- Водяной знак использует шрифт без засечек, встроенный в FFmpeg.
- Для графических водяных знаков используйте вместо этого инструмент Watermark из раздела изображений.
