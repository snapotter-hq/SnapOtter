---
description: "Вырезание фрагмента из видео путём указания времени начала и конца."
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: d1ed5c9ceac6
i18n_hash_version: 2
---

# Trim Video {#trim-video}

Вырезает фрагмент из видео. Можно оставить часть между временем начала и конца или отрезать фиксированный отрезок от начала и от конца. Есть опция покадрово точной обрезки.

В приложении поля времени принимают обычные секунды (`90`), `MM:SS` (`1:30`) или `HH:MM:SS` (`1:02:03.5`). API принимает секунды.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Принимает multipart form data с файлом видео и полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` оставляет часть от `startS` до `endS`. `ends` удаляет `cutStartS` с начала и `cutEndS` с конца |
| startS | number | No | `0` | Режим range: время начала в секундах (должно быть >= 0) |
| endS | number | Range mode | - | Режим range: время конца в секундах (должно быть больше startS) |
| cutStartS | number | No | `0` | Режим ends: секунды, удаляемые с начала |
| cutEndS | number | No | `0` | Режим ends: секунды, удаляемые с конца |
| precise | boolean | No | `false` | Перекодировать весь диапазон, чтобы начало и конец были точными до кадра, вместо копирования от следующего ключевого кадра |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

Отрезать первые 5 секунд и последние 10 секунд независимо от длины видео:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Когда `precise` равно `false` (по умолчанию), клип начинается ровно с запрошенного кадра. Перекодируются только кадры от этого начала до следующего ключевого кадра, остальное копируется, поэтому операция остаётся быстрой. Конец может оказаться на кадр-другой длиннее, потому что скопированный поток сохраняет кадры, от которых зависят предыдущие. Источники, которые нельзя безопасно склеить (H.264 с 10-битным цветом или с чересстрочной развёрткой, другие кодеки, которым нужно перекодированное начало, а также файлы AVI, FLV, MPEG и TS), вместо этого перекодируются целиком.
- Установка `precise` в `true` всегда перекодирует весь диапазон, поэтому оба конца точны, но это занимает больше времени.
- В режиме range `endS` должно быть больше `startS`. Если `endS` выходит за конец видео, клип идёт до конца.
- В режиме ends хотя бы одно из значений `cutStartS` и `cutEndS` должно быть больше нуля, а вместе они должны оставлять часть видео. Поскольку обрезка отсчитывается от длины каждого файла, одна настройка подходит для пакета видео разной длительности.
