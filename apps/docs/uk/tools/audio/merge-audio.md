---
description: "Об'єднуйте кілька аудіофайлів в одну послідовну доріжку."
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: 377258430e0c
---

# Об'єднати аудіо {#merge-audio}

Об'єднуйте два чи більше аудіофайлів в одну послідовну доріжку, зчеплену в порядку їх завантаження.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

Приймає багаточастинні дані форми з кількома аудіофайлами та JSON-полем `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| format | string | Ні | `"mp3"` | Вихідний формат: `mp3`, `wav`, `flac`, `m4a` |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## Примітки {#notes}

- Приймає від 2 до 10 аудіофайлів на запит.
- Файли зчеплюються в порядку завантаження.
- Усі вхідні файли перекодовуються у вибраний вихідний формат та частоту дискретизації для безшовного з'єднання.
- Мішані вхідні формати підтримуються (наприклад, один WAV та один MP3).
