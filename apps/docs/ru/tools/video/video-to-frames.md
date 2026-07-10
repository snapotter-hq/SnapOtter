---
description: "Извлечение кадров из видео в виде ZIP-архива изображений."
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: b71ae2107695
---

# Video to Frames {#video-to-frames}

Извлечение отдельных кадров из видео и их загрузка в виде ZIP-архива изображений PNG или JPG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

Принимает multipart form data с файлом видео и полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | Режим извлечения: `all`, `nth`, `timestamps` |
| n | integer | No | `10` | Извлекать каждый N-й кадр (2-1000). Используется только когда mode равен `"nth"` |
| timestamps | string | No | `""` | Отметки времени в секундах через запятую. Обязательно, когда mode равен `"timestamps"` |
| format | string | No | `"png"` | Формат изображений для извлечённых кадров: `png`, `jpg` |

## Example Request {#example-request}

Извлечение каждого 30-го кадра в JPG:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

Извлечение кадров по заданным отметкам времени:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- Режим `all` извлекает каждый кадр и для длинных видео может создавать очень большие ZIP-файлы. Для выборочного извлечения используйте режим `nth` или `timestamps`.
- PNG сохраняет полное качество, но создаёт более крупные файлы. JPG меньше по размеру, но с потерями.
- Ответ загружается как ZIP-архив, содержащий последовательно пронумерованные файлы изображений.
