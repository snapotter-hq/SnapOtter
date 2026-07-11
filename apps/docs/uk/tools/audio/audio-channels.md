---
description: "Конвертуйте між моно та стерео або міняйте місцями лівий і правий канали."
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: db162f4d4dec
---

# Аудіоканали {#audio-channels}

Конвертуйте аудіо між моно- та стереорозкладками або міняйте місцями лівий і правий канали стереофайлу.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

Приймає багаточастинні дані форми з аудіофайлом та JSON-полем `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| mode | string | Так | - | Операція з каналами: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## Примітки {#notes}

- `stereo-to-mono` змішує обидва канали в одну моно-доріжку.
- `mono-to-stereo` дублює моно-канал на лівий і правий.
- `swap` міняє місцями лівий і правий канали стереофайлу.
- Вихід зазвичай зберігає вхідний контейнер. Вхід AAC записується як M4A, а непідтримувані входи лише для декодування переходять на MP3.
