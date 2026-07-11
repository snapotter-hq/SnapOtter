---
description: "Зменшує розмір відеофайлу з контролем якості."
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: a3c685346697
---

# Compress Video {#compress-video}

Зменшує розмір відеофайлу за допомогою налаштовуваної сили стиснення та необов'язкового зменшення роздільної здатності.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

Приймає дані форми multipart із відеофайлом і полем JSON `settings`. Це асинхронний ендпоінт: він одразу повертає `202 Accepted`, а прогрес передається через SSE за адресою `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | Сила стиснення: `light`, `balanced`, `strong` |
| resolution | string | No | `"original"` | Вихідна роздільна здатність: `original`, `1080p`, `720p`, `480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Пресет `light` зберігає якість, близьку до оригінальної. Пресет `strong` агресивно зменшує розмір файлу за рахунок візуальної точності.
- Зменшення роздільної здатності (наприклад, з 4K до 720p) поєднується зі стисненням для значного зменшення розміру.
- Оновлення прогресу доступні через SSE за адресою `GET /api/v1/jobs/{jobId}/progress` до завершення завдання.
