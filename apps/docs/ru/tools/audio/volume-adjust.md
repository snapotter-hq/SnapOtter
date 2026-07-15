---
description: "Увеличение или уменьшение громкости аудио на фиксированное усиление в децибелах."
i18n_source_hash: 4bc993fd4e08
i18n_provenance: human
i18n_output_hash: 9175e6e694ae
---

# Регулировка громкости {#volume-adjust}

Увеличение или уменьшение громкости аудиофайла путём применения фиксированного усиления в децибелах.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

Принимает multipart form data с аудиофайлом и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| gainDb | number | Нет | `3` | Регулировка громкости в децибелах (от -30 до 30) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
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

- Положительные значения увеличивают громкость; отрицательные уменьшают её.
- Большое положительное усиление может вызвать клиппинг. Для безопасного по громкости выравнивания используйте normalize-audio.
- Выходной файл обычно сохраняет контейнер входного. Вход AAC записывается как M4A, а неподдерживаемые входы, доступные только для декодирования, заменяются на MP3.
