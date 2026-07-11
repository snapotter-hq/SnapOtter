---
description: "Преобразование аудио между форматами MP3, WAV, OGG, FLAC и M4A."
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: 23fa00361fd5
---

# Преобразование аудио {#convert-audio}

Преобразуйте аудиофайлы между распространёнными форматами, включая MP3, WAV, OGG, FLAC и M4A, с настраиваемым выходным битрейтом.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Принимает данные формы multipart с аудиофайлом и полем `settings` в формате JSON.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| format | string | Нет | `"mp3"` | Выходной формат: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Нет | `192` | Выходной битрейт в кбит/с (от 32 до 320) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## Примечания {#notes}

- Поддерживаемые входные форматы включают MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF и OPUS.
- Битрейт применяется только к форматам с потерями (MP3, OGG, M4A). Форматы без потерь, такие как WAV и FLAC, игнорируют эту настройку.
- Имя выходного файла сохраняет исходное имя с новым расширением.
