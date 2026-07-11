---
description: "Генерація файлів субтитрів з аудіодоріжок відео за допомогою ШІ."
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: ef1491af47fc
---

# Auto Subtitles {#auto-subtitles}

Генеруйте файли субтитрів з аудіодоріжки відео за допомогою розпізнавання мовлення на основі ШІ (faster-whisper). Підтримує автовизначення та 10 явних мов.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

Приймає багаточастинні (multipart) дані форми з відеофайлом та полем JSON `settings`. Це асинхронна кінцева точка - вона одразу повертає `202 Accepted`, а перебіг транслюється через SSE за адресою `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | Мова мовлення: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | No | `"srt"` | Вихідний формат субтитрів: `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Це інструмент на основі ШІ, який потребує встановлення набору функцій **transcription**. Якщо набір не встановлено, API повертає `501 Feature Not Installed` з інструкціями щодо його встановлення через адмінінтерфейс.
- Мовний варіант `auto` використовує вбудоване визначення мови whisper. Явне вказання мови підвищує точність та швидкість.
- SRT є найбільш широко підтримуваним форматом субтитрів. VTT (WebVTT) є стандартом для вебплеєрів відео.
- Оновлення перебігу доступні через SSE за адресою `GET /api/v1/jobs/{jobId}/progress` до завершення завдання.
