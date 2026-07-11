---
description: "Конвертує відеокліп в анімоване зображення WebP."
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: 9ae05b03c6a3
---

# Video to WebP {#video-to-webp}

Конвертує відеокліп в анімоване зображення WebP із налаштовуваною частотою кадрів, шириною та якістю.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

Приймає дані форми multipart із відеофайлом і полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Вихідна частота кадрів (1-30) |
| width | integer | No | `480` | Вихідна ширина в пікселях (16-1920). Висота масштабується пропорційно |
| quality | integer | No | `75` | Якість стиснення WebP (1-100) |
| loop | boolean | No | `true` | Зациклити анімацію |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Анімований WebP створює менші файли, ніж GIF, із кращою підтримкою кольорів (24-бітна проти 8-бітної палітри).
- Нижчі значення `quality` дають менші файли за рахунок візуальної точності.
- Встановіть `loop` у `false` для анімацій, які мають відтворитися один раз і зупинитися.
