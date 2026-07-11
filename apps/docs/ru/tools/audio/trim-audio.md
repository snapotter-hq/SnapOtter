---
description: "Вырезание фрагмента из аудиофайла путём указания времени начала и конца."
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: abbd6100e3b7
---

# Обрезка аудио {#trim-audio}

Вырезание фрагмента из аудиофайла путём указания времени начала и конца в секундах.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Принимает multipart form data с аудиофайлом и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| startS | number | Нет | `0` | Время начала в секундах (минимум 0) |
| endS | number | Да | - | Время конца в секундах (должно быть после начала) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Примечания {#notes}

- Время указывается в секундах и может содержать десятичные доли (например, `10.5`).
- Значение `endS` должно быть больше `startS`.
- Если `endS` превышает длительность аудио, файл обрезается до конца.
- Выходной файл обычно сохраняет контейнер входного. Вход AAC записывается как M4A, а неподдерживаемые входы, доступные только для декодирования, заменяются на MP3.
