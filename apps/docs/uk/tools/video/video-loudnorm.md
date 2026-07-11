---
description: "Нормалізує гучність аудіо відео до стандарту мовлення."
i18n_source_hash: 078f1e819c9a
i18n_provenance: human
i18n_output_hash: 5fceeac77e8e
---

# Normalize Audio {#normalize-audio}

Нормалізує гучність аудіо відео до стандарту гучності мовлення EBU R128.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

Приймає дані форми multipart із відеофайлом. Цей інструмент не має налаштувань.

## Parameters {#parameters}

Цей інструмент не має параметрів. Він застосовує нормалізацію гучності EBU R128 до аудіодоріжки.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- Використовує фільтр FFmpeg `loudnorm` з цільовою інтегральною гучністю -16 LUFS, істинним піком -1.5 dBTP і діапазоном гучності 11 LU (стандарт мовлення EBU R128).
- Частота дискретизації вихідного аудіо зберігається у вихідному файлі.
- Якщо у відео немає аудіодоріжки, запит повертає помилку 400.
