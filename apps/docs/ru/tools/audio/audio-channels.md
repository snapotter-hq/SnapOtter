---
description: "Преобразование между моно и стерео или перестановка левого и правого каналов."
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: 83f2b672526c
---

# Каналы аудио {#audio-channels}

Преобразуйте аудио между раскладками моно и стерео или поменяйте местами левый и правый каналы стереофайла.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

Принимает данные формы multipart с аудиофайлом и полем `settings` в формате JSON.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| mode | string | Да | - | Операция с каналами: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## Примечания {#notes}

- `stereo-to-mono` смешивает оба канала в одну моно-дорожку.
- `mono-to-stereo` дублирует моно-канал в левый и правый.
- `swap` меняет местами левый и правый каналы стереофайла.
- Вывод обычно сохраняет входной контейнер. Вход AAC записывается как M4A, а неподдерживаемые для декодирования входы откатываются к MP3.
