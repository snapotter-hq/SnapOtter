---
description: "Збільшення або зменшення гучності аудіо на фіксоване підсилення в децибелах."
i18n_source_hash: 4bc993fd4e08
i18n_provenance: human
i18n_output_hash: 049567a2ea1e
---

# Регулювання гучності {#volume-adjust}

Збільшення або зменшення гучності аудіофайлу шляхом застосування фіксованого підсилення в децибелах.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

Приймає дані форми multipart з аудіофайлом та JSON-полем `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| gainDb | number | No | `3` | Регулювання гучності в децибелах (від -30 до 30) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- Додатні значення збільшують гучність; від'ємні значення зменшують її.
- Великі додатні підсилення можуть спричинити кліпінг. Використовуйте normalize-audio для безпечного за гучністю вирівнювання.
- Вивід зазвичай зберігає вхідний контейнер. Вхід AAC записується як M4A, а непідтримувані входи, доступні лише для декодування, повертаються до MP3.
