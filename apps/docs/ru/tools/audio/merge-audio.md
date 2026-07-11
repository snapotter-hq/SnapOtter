---
description: "Объединение нескольких аудиофайлов в одну последовательную дорожку."
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: cf76ab9598fa
---

# Объединение аудио {#merge-audio}

Объедините два или более аудиофайлов в единую последовательную дорожку, соединённую в порядке загрузки.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

Принимает данные формы multipart с несколькими аудиофайлами и полем `settings` в формате JSON.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| format | string | Нет | `"mp3"` | Выходной формат: `mp3`, `wav`, `flac`, `m4a` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## Примечания {#notes}

- Принимает от 2 до 10 аудиофайлов за один запрос.
- Файлы соединяются в порядке загрузки.
- Все входные файлы перекодируются в выбранный выходной формат и частоту дискретизации для бесшовного соединения.
- Поддерживаются смешанные входные форматы (например, один WAV и один MP3).
