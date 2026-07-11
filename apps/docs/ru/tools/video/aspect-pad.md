---
description: "Добавление полос сплошного цвета для подгонки под целевое соотношение сторон."
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: a8cbbb13186e
---

# Aspect Pad {#aspect-pad}

Добавьте полосы сплошного цвета сверху/снизу (letterbox) или по бокам (pillarbox), чтобы вписать видео в целевое соотношение сторон без обрезки.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

Принимает данные multipart form с видеофайлом и JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| target | string | Нет | `"9:16"` | Целевое соотношение сторон: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | Нет | `"#000000"` | Hex-цвет для полос заполнения (например, `"#000000"` для чёрного) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- Если видео уже соответствует целевому соотношению сторон, файл возвращается без изменений.
- Используйте `9:16` для вертикальных/портретных форматов социальных сетей (TikTok, Reels, Shorts).
- Для размытого заполнения вместо сплошного цвета используйте инструмент Blur Pad.
