---
description: "Відтворює відеокліп у зворотному напрямку."
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: fb06e79e27dd
---

# Reverse Video {#reverse-video}

Відтворює відеокліп у зворотному напрямку. Аудіодоріжка також реверсується.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

Приймає дані форми multipart із відеофайлом. Цей інструмент не має налаштувань.

## Parameters {#parameters}

Цей інструмент не має параметрів. Він реверсує все відео.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes {#notes}

- Обмежено кліпами тривалістю до 5 хвилин. Довші відео відхиляються з помилкою 400.
- Реверсуються і відео-, і аудіодоріжки. Щоб реверсувати відео без аудіо, спершу заглушіть його.
