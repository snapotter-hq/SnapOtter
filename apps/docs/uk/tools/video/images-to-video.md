---
description: "Перетворює набір зображень на відео-слайдшоу."
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: efae969c6890
---

# Images to Video {#images-to-video}

Перетворює набір зображень на відео-слайдшоу з налаштовуваною тривалістю на зображення, роздільною здатністю та частотою кадрів.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Приймає дані форми multipart із двома або більше файлами зображень і полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | Тривалість показу кожного зображення в секундах (0.5-10) |
| resolution | string | No | `"720p"` | Вихідна роздільна здатність: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Вихідна частота кадрів (10-60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- Приймає 2-60 файлів зображень на запит. Зображення з'являються у відео в порядку завантаження.
- Зображення масштабуються й доповнюються полями, щоб вміститися в цільову роздільну здатність зі збереженням співвідношення сторін.
- Опція роздільної здатності `square` створює відео 1080x1080, зручне для соціальних мереж.
- Вихідний формат завжди MP4 (H.264).
