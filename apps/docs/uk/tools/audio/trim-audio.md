---
description: "Вирізання ділянки з аудіофайлу шляхом зазначення часу початку та кінця."
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: e7b0545d460c
i18n_hash_version: 2
---

# Trim Audio {#trim-audio}

Вирізання ділянки з аудіофайлу. Можна залишити частину між часом початку та кінця або відрізати фіксований обсяг на початку й наприкінці.

У застосунку поля часу приймають прості секунди (`90`), `MM:SS` (`1:30`) або `HH:MM:SS` (`1:02:03.5`). API приймає секунди.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Приймає дані форми multipart з аудіофайлом та JSON-полем `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` залишає ділянку від `startS` до `endS`. `ends` вилучає `cutStartS` з початку та `cutEndS` з кінця |
| startS | number | No | `0` | Режим діапазону: час початку в секундах (мінімум 0) |
| endS | number | Range mode | - | Режим діапазону: час кінця в секундах (має бути після початку) |
| cutStartS | number | No | `0` | Режим країв: скільки секунд вилучити з початку |
| cutEndS | number | No | `0` | Режим країв: скільки секунд вилучити з кінця |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

Відрізати перші 2 секунди й останні 3 секунди, незалежно від довжини файлу:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- Час зазначається в секундах і може містити десяткові дроби (наприклад, `10.5`).
- У режимі діапазону `endS` має бути більшим за `startS`. Якщо `endS` перевищує тривалість аудіо, файл обрізається до кінця.
- У режимі країв хоча б одне зі значень `cutStartS` і `cutEndS` має бути більшим за нуль, а разом вони мають залишити щонайменше 0,1 секунди аудіо. Оскільки відрізання вимірюється від довжини кожного файлу, одне налаштування працює для пакета файлів різної тривалості.
- Вивід зазвичай зберігає вхідний контейнер. Вхід AAC записується як M4A, а непідтримувані входи, доступні лише для декодування, повертаються до MP3.
