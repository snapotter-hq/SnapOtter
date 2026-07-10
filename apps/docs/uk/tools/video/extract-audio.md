---
description: "Витягує аудіодоріжку з відео."
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: 1ac630bdf2fd
---

# Extract Audio {#extract-audio}

Витягує аудіодоріжку з відеофайлу й зберігає її як MP3, WAV, M4A або OGG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

Приймає дані форми multipart із відеофайлом і полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Вихідний формат аудіо: `mp3`, `wav`, `m4a`, `ogg` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Якщо у відео немає аудіодоріжки, запит повертає помилку 400.
- MP3 із втратами, але широко сумісний. WAV без втрат, але великий. M4A (AAC) забезпечує гарний баланс якості та розміру. OGG доступний для робочих процесів із відкритими кодеками.
- Коли вихідне аудіо вже в AAC, а вихідний формат M4A, аудіопотік копіюється без перекодування.
