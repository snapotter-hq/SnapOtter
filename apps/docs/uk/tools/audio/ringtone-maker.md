---
description: "Створюйте кліп рингтону з будь-якого аудіофайлу."
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: 5a5d2ab8e8e8
---

# Створювач рингтонів {#ringtone-maker}

Створюйте кліп рингтону (.m4r) з будь-якого аудіофайлу, вибираючи час початку та тривалість.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

Приймає багаточастинні дані форми з аудіофайлом та JSON-полем `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| startS | number | Ні | `0` | Час початку в секундах (мінімум 0) |
| durationS | number | Ні | `30` | Тривалість кліпу в секундах (1 до 30) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## Примітки {#notes}

- Вихід завжди у форматі M4R, сумісному з рингтонами iPhone.
- Максимальна тривалість рингтону становить 30 секунд (обмеження Apple).
- Будь-який аудіоформат можна використовувати як вхід.
