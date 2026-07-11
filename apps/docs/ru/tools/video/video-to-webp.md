---
description: "Конвертация видеоклипа в анимированное изображение WebP."
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: 4af9f1d3f2f4
---

# Video to WebP {#video-to-webp}

Конвертация видеоклипа в анимированное изображение WebP с настраиваемой частотой кадров, шириной и качеством.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

Принимает multipart form data с файлом видео и полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Выходная частота кадров (1-30) |
| width | integer | No | `480` | Выходная ширина в пикселях (16-1920). Высота масштабируется пропорционально |
| quality | integer | No | `75` | Качество сжатия WebP (1-100) |
| loop | boolean | No | `true` | Зациклить анимацию |

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

- Анимированный WebP создаёт меньшие по размеру файлы, чем GIF, с лучшей поддержкой цвета (24-битная против 8-битной палитры).
- Более низкие значения `quality` дают меньшие по размеру файлы за счёт визуальной точности.
- Установите `loop` в `false` для анимаций, которые должны проиграться один раз и остановиться.
