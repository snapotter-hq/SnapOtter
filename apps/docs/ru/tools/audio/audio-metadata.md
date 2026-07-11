---
description: "Просмотр, редактирование или удаление метаданных аудио (теги ID3)."
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: 88fd4af937ab
---

# Метаданные аудио {#audio-metadata}

Просматривайте, редактируйте или удаляйте теги метаданных аудио, такие как название, исполнитель и альбом (ID3 и подобные форматы тегов).

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

Принимает данные формы multipart с аудиофайлом и полем `settings` в формате JSON.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| strip | boolean | Нет | `false` | Удалить все существующие теги метаданных |
| title | string | Нет | - | Задать тег названия (макс. 500 символов) |
| artist | string | Нет | - | Задать тег исполнителя (макс. 500 символов) |
| album | string | Нет | - | Задать тег альбома (макс. 500 символов) |

## Пример запроса {#example-request}

Редактирование тегов метаданных:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

Удаление всех метаданных:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4480000,
  "metadata": {
    "container": "mp3",
    "durationS": 245.3,
    "bitrateKbps": 192,
    "tags": {
      "title": "My Song",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
}
```

## Примечания {#notes}

- Ответ включает объект `metadata` с форматом контейнера, длительностью, битрейтом и текущими тегами.
- Когда `strip` равно `true`, все поля тегов игнорируются, и каждый существующий тег удаляется.
- Обновляются только те теги, которые вы указываете; неуказанные теги остаются без изменений.
- Формат вывода совпадает с форматом ввода.
