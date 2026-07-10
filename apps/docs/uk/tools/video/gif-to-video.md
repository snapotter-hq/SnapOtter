---
description: "Конвертує анімований GIF у відео MP4, WebM або MOV."
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: cb1eee881be8
---

# GIF to Video {#gif-to-video}

Конвертує анімований GIF у компактний відеофайл MP4, WebM або MOV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

Приймає дані форми multipart із файлом GIF і полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Вихідний формат: `mp4`, `webm`, `mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- Конвертація GIF у відео зазвичай зменшує розмір файлу на 80-90%, зберігаючи ту саму візуальну якість.
- Приймаються лише анімовані файли GIF. Для статичних зображень слід використовувати інструмент Convert для зображень.
- MP4 і MOV використовують кодування H.264, WebM використовує VP9.
