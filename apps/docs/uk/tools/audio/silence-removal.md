---
description: "Видалення тихих ділянок з аудіофайлу."
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: 87b958871feb
---

# Silence Removal {#silence-removal}

Виявлення та видалення тихих ділянок з аудіофайлу на основі налаштовуваного порогу та мінімальної тривалості.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

Приймає дані форми multipart з аудіофайлом та JSON-полем `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | No | `-50` | Поріг тиші в дБ (від -80 до -20). Звук нижче цього рівня вважається тишею. |
| minSilenceS | number | No | `0.5` | Мінімальна тривалість тиші в секундах для видалення (від 0.1 до 5) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Вищий (менш від'ємний) поріг є агресивнішим і видаляє тихіші фрагменти разом зі справжньою тишею.
- Збільште `minSilenceS`, щоб видаляти лише довші паузи, зберігаючи короткі природні проміжки.
- Корисно для очищення записів подкастів, лекцій та голосових нотаток.
- Вивід зазвичай зберігає вхідний контейнер. Вхід AAC записується як M4A, а непідтримувані входи, доступні лише для декодування, повертаються до MP3.
