---
description: "Изменение частоты кадров видео."
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: 29f652943b37
---

# Change FPS {#change-fps}

Изменение частоты кадров видео до целевого значения от 1 до 120 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

Принимает multipart form data с файлом видео и полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | Целевая частота кадров (1-120) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- Понижение частоты кадров отбрасывает кадры и уменьшает размер файла. Повышение дублирует кадры, чтобы заполнить пробел, но не добавляет реальной детализации движения.
- Распространённые целевые значения: 24 (кино), 30 (веб/вещание), 60 (плавное воспроизведение).
- Аудиодорожка сохраняется с исходной частотой дискретизации.
