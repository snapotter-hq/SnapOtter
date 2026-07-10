---
description: "Змінює частоту кадрів відео."
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: d2642d1c519d
---

# Change FPS {#change-fps}

Змінює частоту кадрів відео на цільове значення в діапазоні від 1 до 120 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

Приймає дані форми multipart із відеофайлом і полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | Цільова частота кадрів (1-120) |

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

- Зниження частоти кадрів відкидає кадри й зменшує розмір файлу. Підвищення дублює кадри, щоб заповнити прогалину, але не додає реальної деталізації руху.
- Поширені цільові значення: 24 (кіно), 30 (веб/мовлення), 60 (плавне відтворення).
- Аудіодоріжка зберігається з її вихідною частотою дискретизації.
