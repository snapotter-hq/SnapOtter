---
description: "Назавжди вбудовує субтитри в кадри відео."
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: 4f03202f912e
---

# Burn Subtitles {#burn-subtitles}

Назавжди рендерить (жорстко вбудовує) субтитри з файлу SRT, VTT або ASS у кожен кадр відео.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

Приймає дані форми multipart із відеофайлом і файлом субтитрів. Це асинхронний ендпоінт: він одразу повертає `202 Accepted`, а прогрес передається через SSE за адресою `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | Розмір шрифту субтитрів у пікселях (8-72) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Завантажте два файли: перший має бути відео, другий має бути файлом субтитрів (.srt, .vtt або .ass).
- Вбудовані субтитри назавжди стають частиною відео, і глядач не може їх вимкнути. Для перемикних субтитрів використовуйте натомість інструмент Embed Subtitles.
- Оновлення прогресу доступні через SSE за адресою `GET /api/v1/jobs/{jobId}/progress` до завершення завдання.
