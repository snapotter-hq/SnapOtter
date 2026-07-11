---
description: "Добавление эффектов нарастания и затухания к аудио."
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: 5a2950c4b487
---

# Нарастание и затухание аудио {#fade-audio}

Добавьте эффекты нарастания и затухания в начало и конец аудиофайла.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

Принимает данные формы multipart с аудиофайлом и полем `settings` в формате JSON.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| fadeInS | number | Нет | `1` | Длительность нарастания в секундах (от 0 до 30) |
| fadeOutS | number | Нет | `1` | Длительность затухания в секундах (от 0 до 30) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Примечания {#notes}

- Задайте любое из значений равным `0`, чтобы пропустить это направление затухания. Хотя бы одно значение должно быть больше 0.
- Длительность затухания ограничивается длиной аудио, если превышает её.
- Вывод обычно сохраняет входной контейнер. Вход AAC записывается как M4A, а неподдерживаемые для декодирования входы откатываются к MP3.
