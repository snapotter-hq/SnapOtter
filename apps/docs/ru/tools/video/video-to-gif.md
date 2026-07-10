---
description: "Превращение видеоклипа в анимированный GIF."
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: d5b259714d2d
---

# Video to GIF {#video-to-gif}

Превращение видеоклипа в анимированный GIF с настраиваемой частотой кадров, шириной, временем начала и длительностью.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

Принимает multipart form data с файлом видео и полем JSON `settings`. Это асинхронная конечная точка: она сразу возвращает `202 Accepted`, а прогресс передаётся через SSE по адресу `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Выходная частота кадров (1-30) |
| width | integer | No | `480` | Выходная ширина в пикселях (64-1280). Высота масштабируется пропорционально |
| startS | number | No | `0` | Время начала в секундах (должно быть >= 0) |
| durationS | number | No | `5` | Длительность в секундах (больше 0, максимум 60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Более низкие значения `fps` и `width` дают меньшие по размеру файлы GIF. GIF шириной 480px при 12 fps обычно даёт хороший баланс.
- Максимальная длительность - 60 секунд. Более длинные клипы создают очень большие файлы.
- Обновления прогресса доступны через SSE по адресу `GET /api/v1/jobs/{jobId}/progress` до завершения задания.
