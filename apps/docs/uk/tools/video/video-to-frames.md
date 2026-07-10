---
description: "Витягує кадри з відео як ZIP-архів зображень."
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: 73b6293120c3
---

# Video to Frames {#video-to-frames}

Витягує окремі кадри з відео й завантажує їх як ZIP-архів зображень PNG або JPG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

Приймає дані форми multipart із відеофайлом і полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | Режим витягування: `all`, `nth`, `timestamps` |
| n | integer | No | `10` | Витягувати кожен N-й кадр (2-1000). Використовується лише коли режим `"nth"` |
| timestamps | string | No | `""` | Мітки часу в секундах через кому. Обов'язково, коли режим `"timestamps"` |
| format | string | No | `"png"` | Формат зображення для витягнутих кадрів: `png`, `jpg` |

## Example Request {#example-request}

Витягнути кожен 30-й кадр як JPG:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

Витягнути кадри за конкретними мітками часу:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- Режим `all` витягує кожен кадр і може створювати дуже великі ZIP-файли для довгих відео. Для вибіркового витягування використовуйте режим `nth` або `timestamps`.
- PNG зберігає повну якість, але створює більші файли. JPG менший, але з втратами.
- Відповідь завантажується як ZIP-архів, що містить послідовно пронумеровані файли зображень.
