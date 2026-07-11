---
description: "Перетворює відеокліп на анімований GIF."
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: df97160560c7
---

# Video to GIF {#video-to-gif}

Перетворює відеокліп на анімований GIF із налаштовуваною частотою кадрів, шириною, часом початку та тривалістю.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

Приймає дані форми multipart із відеофайлом і полем JSON `settings`. Це асинхронний ендпоінт: він одразу повертає `202 Accepted`, а прогрес передається через SSE за адресою `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Вихідна частота кадрів (1-30) |
| width | integer | No | `480` | Вихідна ширина в пікселях (64-1280). Висота масштабується пропорційно |
| startS | number | No | `0` | Час початку в секундах (має бути >= 0) |
| durationS | number | No | `5` | Тривалість у секундах (більше 0, максимум 60) |

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

- Нижчі значення `fps` і `width` дають менші файли GIF. GIF шириною 480px при 12 fps зазвичай є гарним балансом.
- Максимальна тривалість - 60 секунд. Довші кліпи дають дуже великі файли.
- Оновлення прогресу доступні через SSE за адресою `GET /api/v1/jobs/{jobId}/progress` до завершення завдання.
