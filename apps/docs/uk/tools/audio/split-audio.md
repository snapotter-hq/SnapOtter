---
description: "Розділення аудіо за часовими інтервалами, рівними частинами або виявленням тиші."
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: 0e49077dadd5
---

# Split Audio {#split-audio}

Розділення аудіофайлу на сегменти за фіксованими часовими інтервалами, рівними частинами або автоматичним виявленням тиші. Повертає архів ZIP із сегментами.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

Приймає дані форми multipart з аудіофайлом та JSON-полем `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"time"` | Стратегія розділення: `time`, `parts`, `silence` |
| segmentS | number | No | `60` | Довжина сегмента в секундах, від 1 до 3600 (використовується, коли mode дорівнює `time`) |
| parts | integer | No | `2` | Кількість рівних частин, від 2 до 20 (використовується, коли mode дорівнює `parts`) |
| thresholdDb | number | No | `-40` | Поріг тиші в дБ, від -80 до -20 (використовується, коли mode дорівнює `silence`) |
| minSilenceS | number | No | `0.3` | Мінімальний проміжок тиші в секундах, від 0.1 до 10 (використовується, коли mode дорівнює `silence`) |

## Example Request {#example-request}

Розділити на 30-секундні сегменти:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

Розділити за виявленням тиші:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## Notes {#notes}

- `downloadUrl` вказує на архів ZIP, що містить усі сегменти.
- Використовуються лише параметри, релевантні для обраного `mode`; інші ігноруються.
- Імена файлів сегментів нумеруються послідовно (наприклад, `part-000.mp3`, `part-001.mp3`).
- Формат виводу відповідає вхідному формату.
