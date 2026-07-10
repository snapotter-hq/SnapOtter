---
description: "Создание клипа рингтона из любого аудиофайла."
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: c8be61fcc18c
---

# Создание рингтона {#ringtone-maker}

Создайте клип рингтона (.m4r) из любого аудиофайла, выбрав время начала и длительность.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

Принимает данные формы multipart с аудиофайлом и полем `settings` в формате JSON.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| startS | number | Нет | `0` | Время начала в секундах (минимум 0) |
| durationS | number | Нет | `30` | Длительность клипа в секундах (от 1 до 30) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## Примечания {#notes}

- Вывод всегда в формате M4R, совместимом с рингтонами iPhone.
- Максимальная длительность рингтона — 30 секунд (ограничение Apple).
- В качестве входа можно использовать любой аудиоформат.
