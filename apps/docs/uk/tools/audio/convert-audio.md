---
description: "Конвертуйте аудіо між форматами MP3, WAV, OGG, FLAC та M4A."
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: 396aa87e0396
---

# Конвертувати аудіо {#convert-audio}

Конвертуйте аудіофайли між поширеними форматами, зокрема MP3, WAV, OGG, FLAC та M4A, з налаштовуваним вихідним бітрейтом і частотою дискретизації.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Приймає багаточастинні дані форми з аудіофайлом та JSON-полем `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| format | string | Ні | `"mp3"` | Вихідний формат: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Ні | `192` | Вихідний бітрейт у kbps (32 до 320) |
| sampleRate | integer | Ні | частота джерела | Вихідна частота дискретизації в Hz: `8000`, `16000`, `22050`, `32000`, `44100`, `48000` або `96000`. Пропустіть, щоб зберегти частоту джерела |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## Примітки {#notes}

- Підтримувані вхідні формати включають MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF та OPUS.
- Бітрейт застосовується лише до форматів зі втратами (MP3, OGG, M4A). Формати без втрат, як-от WAV та FLAC, ігнорують це налаштування.
- Вихідний MP3 підтримує частоти дискретизації до 48000 Hz. Опція 96000 Hz застосовується лише до WAV, OGG, FLAC та M4A.
- Бітрейт MP3 обмежується частотою дискретизації: щонайбільше 64 kbps при 8000 Hz і 160 kbps при 16000 або 22050 Hz. Запити вище цього обмеження відхиляються, а не знижуються без попередження.
- Ім'я вихідного файлу зберігає оригінальну назву з новим розширенням.
