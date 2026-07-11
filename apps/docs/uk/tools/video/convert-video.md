---
description: "Конвертує відео між MP4, MOV, WebM, AVI та MKV."
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: 4ba1d103b4d3
---

# Convert Video {#convert-video}

Конвертує відео між форматами MP4, MOV, WebM, AVI та MKV із налаштовуваними пресетами якості.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

Приймає дані форми multipart із відеофайлом і полем JSON `settings`. Це асинхронний ендпоінт: він одразу повертає `202 Accepted`, а прогрес передається через SSE за адресою `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Вихідний формат: `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | No | `"balanced"` | Пресет якості: `high`, `balanced`, `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Пресет якості `high` дає найкращу візуальну точність, але більші файли. Пресет `small` агресивно стискає для мінімального розміру файлу.
- Вихід у WebM використовує кодування VP9. MP4 і MOV використовують H.264. AVI та MKV доступні для застарілих або архівних робочих процесів.
- Оновлення прогресу доступні через SSE за адресою `GET /api/v1/jobs/{jobId}/progress` до завершення завдання.
