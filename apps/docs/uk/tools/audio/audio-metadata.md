---
description: "Переглядайте, редагуйте або видаляйте метадані аудіотегів (ID3)."
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: 8fa2bee6c948
---

# Метадані аудіо {#audio-metadata}

Переглядайте, редагуйте або видаляйте метадані аудіотегів, як-от назва, виконавець та альбом (ID3 та подібні формати тегів).

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

Приймає багаточастинні дані форми з аудіофайлом та JSON-полем `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| strip | boolean | Ні | `false` | Видалити всі наявні метадані тегів |
| title | string | Ні | - | Задати тег назви (макс. 500 символів) |
| artist | string | Ні | - | Задати тег виконавця (макс. 500 символів) |
| album | string | Ні | - | Задати тег альбому (макс. 500 символів) |

## Приклад запиту {#example-request}

Редагування метаданих тегів:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

Видалення всіх метаданих:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## Приклад відповіді {#example-response}

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

## Примітки {#notes}

- Відповідь містить об'єкт `metadata` із форматом контейнера, тривалістю, бітрейтом та поточними тегами.
- Коли `strip` має значення `true`, усі поля тегів ігноруються, і кожен наявний тег видаляється.
- Оновлюються лише ті теги, які ви надаєте; незадані теги залишаються незмінними.
- Формат виходу відповідає формату входу.
