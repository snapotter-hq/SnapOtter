---
description: "Видаляє аудіодоріжку з відео."
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: 53b9bf84d469
---

# Mute Video {#mute-video}

Видаляє аудіодоріжку з відео, залишаючи лише візуальний потік.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

Приймає дані форми multipart із відеофайлом. Цей інструмент не має налаштувань.

## Parameters {#parameters}

Цей інструмент не має параметрів. Він видаляє аудіодоріжку із завантаженого відео.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- Відеопотік копіюється без перекодування, тому втрати якості немає.
- Якщо вхідне відео не має аудіодоріжки, файл повертається без змін.
