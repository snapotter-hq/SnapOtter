---
description: "Вирізання ділянки з аудіофайлу шляхом зазначення часу початку та кінця."
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: 27cbf23da1a2
---

# Trim Audio {#trim-audio}

Вирізання ділянки з аудіофайлу шляхом зазначення часу початку та кінця в секундах.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Приймає дані форми multipart з аудіофайлом та JSON-полем `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Час початку в секундах (мінімум 0) |
| endS | number | Yes | - | Час кінця в секундах (має бути після початку) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- Час зазначається в секундах і може містити десяткові дроби (наприклад, `10.5`).
- Значення `endS` має бути більшим за `startS`.
- Якщо `endS` перевищує тривалість аудіо, файл обрізається до кінця.
- Вивід зазвичай зберігає вхідний контейнер. Вхід AAC записується як M4A, а непідтримувані входи, доступні лише для декодування, повертаються до MP3.
