---
description: "Превращение набора изображений в видео-слайдшоу."
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: eefbf09d4229
---

# Images to Video {#images-to-video}

Превращение набора изображений в видео-слайдшоу с настраиваемой длительностью показа каждого изображения, разрешением и частотой кадров.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Принимает multipart form data с двумя или более файлами изображений и полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | Длительность показа одного изображения в секундах (0.5-10) |
| resolution | string | No | `"720p"` | Выходное разрешение: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Выходная частота кадров (10-60) |

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

- Принимает от 2 до 60 файлов изображений за запрос. Изображения появляются в видео в порядке загрузки.
- Изображения масштабируются и дополняются полями, чтобы соответствовать целевому разрешению с сохранением соотношения сторон.
- Вариант разрешения `square` создаёт видео 1080x1080, удобное для социальных сетей.
- Выходной формат всегда MP4 (H.264).
