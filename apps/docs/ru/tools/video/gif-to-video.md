---
description: "Конвертация анимированного GIF в видео MP4, WebM или MOV."
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: 916754d7da5d
---

# GIF to Video {#gif-to-video}

Конвертация анимированного GIF в компактный видеофайл MP4, WebM или MOV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

Принимает multipart form data с файлом GIF и полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Выходной формат: `mp4`, `webm`, `mov` |

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

- Конвертация GIF в видео обычно уменьшает размер файла на 80-90 %, сохраняя при этом то же визуальное качество.
- Принимаются только анимированные файлы GIF. Для статичных изображений следует использовать инструмент Convert из раздела изображений.
- MP4 и MOV используют кодирование H.264, WebM использует VP9.
