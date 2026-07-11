---
description: "Заполнение полос размытой копией видео."
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: defcad088e22
---

# Blur Pad {#blur-pad}

Впишите видео в целевое соотношение сторон, заполнив область отступов размытой, масштабированной копией видео вместо полос сплошного цвета.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

Принимает данные multipart form с видеофайлом и JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| target | string | Нет | `"16:9"` | Целевое соотношение сторон: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | Нет | `20` | Сигма гауссова размытия для фона (2-50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notes {#notes}

- Более высокие значения размытия дают более мягкий, более абстрактный фон. Более низкие значения сохраняют больше видимых деталей.
- Если видео уже соответствует целевому соотношению сторон, файл возвращается без изменений.
- Для заполнения сплошным цветом используйте вместо этого инструмент Aspect Pad.
