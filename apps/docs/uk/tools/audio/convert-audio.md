---
description: "Конвертуйте аудіо між форматами MP3, WAV, OGG, FLAC та M4A."
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: 396aa87e0396
---

# Конвертувати аудіо {#convert-audio}

Конвертуйте аудіофайли між поширеними форматами, зокрема MP3, WAV, OGG, FLAC та M4A, з налаштовуваним вихідним бітрейтом.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Приймає багаточастинні дані форми з аудіофайлом та JSON-полем `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| format | string | Ні | `"mp3"` | Вихідний формат: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Ні | `192` | Вихідний бітрейт у kbps (32 до 320) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## Примітки {#notes}

- Підтримувані вхідні формати включають MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF та OPUS.
- Бітрейт застосовується лише до форматів зі втратами (MP3, OGG, M4A). Формати без втрат, як-от WAV та FLAC, ігнорують це налаштування.
- Ім'я вихідного файлу зберігає оригінальну назву з новим розширенням.
