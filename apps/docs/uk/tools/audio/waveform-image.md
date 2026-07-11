---
description: "Генерація візуалізації хвильової форми у вигляді зображення PNG з аудіофайлу."
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: 7d6388035506
---

# Waveform Image {#waveform-image}

Генерація візуалізації хвильової форми у вигляді зображення PNG з аудіофайлу з налаштовуваними розмірами та кольором.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

Приймає дані форми multipart з аудіофайлом та JSON-полем `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | `1024` | Ширина зображення в пікселях (від 256 до 3840) |
| height | integer | No | `256` | Висота зображення в пікселях (від 64 до 1080) |
| color | string | No | `"#4f46e5"` | Шістнадцятковий колір хвильової форми (наприклад, `"#4f46e5"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Notes {#notes}

- Вивід завжди є зображенням PNG, незалежно від вхідного аудіоформату.
- Хвильова форма рендериться на прозорому фоні.
- Корисно для мініатюр, попередніх переглядів у соціальних мережах або вбудовування у вебсторінки.
