---
description: "Об'єднує кілька відеокліпів в один файл."
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: 9b1aee2b28e1
---

# Merge Videos {#merge-videos}

Об'єднує кілька відеокліпів в один файл MP4. Усі вхідні файли приводяться до роздільної здатності першого відео та 30 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

Приймає дані форми multipart із двома або більше відеофайлами. Це асинхронний ендпоінт: він одразу повертає `202 Accepted`, а прогрес передається через SSE за адресою `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

Цей інструмент не має параметрів налаштувань. Завантажте 2-10 відеофайлів як кілька частин `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Кліпи об'єднуються в порядку їхнього завантаження.
- Усі кліпи перекодовуються для відповідності роздільній здатності першого кліпа, частоті кадрів (30 fps) і кодеку (H.264). Невідповідні вхідні файли автоматично приводяться до єдиного вигляду.
- Приймає 2-10 відеофайлів на запит.
- Оновлення прогресу доступні через SSE за адресою `GET /api/v1/jobs/{jobId}/progress` до завершення завдання.
