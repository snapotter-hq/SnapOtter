---
description: "Масштабує відео до нової роздільної здатності або пресетного розміру."
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: d8c1f289668b
---

# Resize Video {#resize-video}

Масштабує відео до нової роздільної здатності, використовуючи власні піксельні розміри або стандартний пресет.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

Приймає дані форми multipart із відеофайлом і полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Цільова ширина в пікселях (16-7680) |
| height | integer | No | - | Цільова висота в пікселях (16-4320) |
| preset | string | No | `"custom"` | Пресет роздільної здатності: `custom`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |

Коли `preset` дорівнює `"custom"`, має бути вказано принаймні одне з `width` або `height`. Інший вимір масштабується пропорційно.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

Змінити розмір до власних вимірів:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- Значення пресетів відповідають стандартним висотам (наприклад, `720p` = 1280x720, `1080p` = 1920x1080). Ширина масштабується пропорційно до співвідношення сторін джерела.
- Розміри округлюються до парних чисел, як цього вимагає більшість відеокодеків.
- Максимальна підтримувана роздільна здатність - 7680x4320 (8K UHD).
