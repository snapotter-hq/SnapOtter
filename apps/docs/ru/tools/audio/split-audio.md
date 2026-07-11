---
description: "Разделение аудио по временным интервалам, на равные части или по обнаружению тишины."
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: ff43da10e5db
---

# Разделение аудио {#split-audio}

Разделение аудиофайла на сегменты по фиксированным временным интервалам, на равные части или с автоматическим обнаружением тишины. Возвращает ZIP-архив с сегментами.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

Принимает multipart form data с аудиофайлом и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| mode | string | Нет | `"time"` | Стратегия разделения: `time`, `parts`, `silence` |
| segmentS | number | Нет | `60` | Длина сегмента в секундах, от 1 до 3600 (используется при режиме `time`) |
| parts | integer | Нет | `2` | Количество равных частей, от 2 до 20 (используется при режиме `parts`) |
| thresholdDb | number | Нет | `-40` | Порог тишины в дБ, от -80 до -20 (используется при режиме `silence`) |
| minSilenceS | number | Нет | `0.3` | Минимальный промежуток тишины в секундах, от 0.1 до 10 (используется при режиме `silence`) |

## Пример запроса {#example-request}

Разделение на сегменты по 30 секунд:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

Разделение по обнаружению тишины:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## Примечания {#notes}

- `downloadUrl` указывает на ZIP-архив, содержащий все сегменты.
- Используются только параметры, относящиеся к выбранному `mode`; остальные игнорируются.
- Имена файлов сегментов нумеруются последовательно (например, `part-000.mp3`, `part-001.mp3`).
- Формат выходного файла совпадает с форматом входного.
