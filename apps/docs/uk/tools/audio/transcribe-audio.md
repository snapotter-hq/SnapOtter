---
description: "Перетворення мовлення на текст за допомогою транскрипції на основі ШІ."
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: 6a7a86bae8da
---

# Transcribe Audio {#transcribe-audio}

Перетворення мовлення на текст за допомогою транскрипції на основі ШІ (faster-whisper). Підтримує формати виводу у вигляді простого тексту, SRT та VTT з автоматичним або ручним вибором мови.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

Приймає дані форми multipart з аудіофайлом та JSON-полем `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | Мова: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | No | `"txt"` | Формат виводу: `txt`, `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Example Response {#example-response}

Це асинхронний інструмент. API повертає `202 Accepted` негайно:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Відстежуйте прогрес через SSE за адресою `GET /api/v1/jobs/{jobId}/progress`. Коли завдання завершується, потік SSE доставляє кінцевий результат із `downloadUrl`.

## Notes {#notes}

- Потребує встановлення набору функцій **transcription**. Повертає `501` із кодом `FEATURE_NOT_INSTALLED`, відсутнім `feature`, `featureName` та `estimatedSize`, якщо набір недоступний.
- Використовує faster-whisper для транскрипції. Мова `auto` визначає мову мовлення автоматично.
- Формати `srt` та `vtt` включають часові позначки для кожного сегмента, придатні для субтитрів.
- Формат `txt` повертає простий текст без часових позначок.
- Це тривалий інструмент ШІ; час обробки залежить від довжини аудіо та апаратного забезпечення сервера.
