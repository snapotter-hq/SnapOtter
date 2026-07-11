---
description: "Зменшує тремтіння камери за допомогою двопрохідної стабілізації."
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: d10b375e1bda
---

# Stabilize Video {#stabilize-video}

Зменшує тремтіння камери в зйомці з рук за допомогою двопрохідної стабілізації vidstab у FFmpeg.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

Приймає дані форми multipart із відеофайлом і полем JSON `settings`. Це асинхронний ендпоінт: він одразу повертає `202 Accepted`, а прогрес передається через SSE за адресою `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | Розмір вікна згладжування в кадрах (5-60). Вищі значення дають плавніший рух |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Стабілізація - це двопрохідний процес: перший прохід аналізує рух камери, а другий застосовує корекцію. Це займає приблизно вдвічі більше часу, ніж однопрохідні інструменти.
- Вищі значення згладжування усувають більше тремтіння, але можуть спричинити невелике збільшення з обрізанням по краях.
- Оновлення прогресу доступні через SSE за адресою `GET /api/v1/jobs/{jobId}/progress` до завершення завдання.
