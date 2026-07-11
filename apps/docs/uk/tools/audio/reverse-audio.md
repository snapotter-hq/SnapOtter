---
description: "Перевертайте аудіофайл, щоб він відтворювався у зворотному напрямку."
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 39259b1bbdda
---

# Перевернути аудіо {#reverse-audio}

Перевертайте аудіофайл, щоб він відтворювався у зворотному напрямку.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

Приймає багаточастинні дані форми з аудіофайлом та JSON-полем `settings`.

## Параметри {#parameters}

Цей інструмент не має налаштовуваних параметрів. Перевертається весь аудіофайл.

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Примітки {#notes}

- Уся аудіодоріжка перевертається з кінця на початок.
- Вихід зазвичай зберігає вхідний контейнер. Вхід AAC записується як M4A, а непідтримувані входи лише для декодування переходять на MP3.
