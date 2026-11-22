---
description: "Конвертує відеокліп в анімоване зображення AVIF."
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: 7a6862b8b572
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

Конвертує відеокліп в анімоване зображення AVIF з налаштовуваною частотою кадрів, шириною, якістю та фрагментом кліпу.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

Приймає дані форми multipart із відеофайлом і полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Вихідна частота кадрів (1-30) |
| width | integer | No | `480` | Вихідна ширина в пікселях (64-1280). Висота масштабується пропорційно |
| startS | number | No | `0` | Початок фрагмента в секундах |
| durationS | number | No | `5` | Довжина фрагмента в секундах (до 60) |
| quality | integer | No | `50` | Якість AVIF (1-100) |
| loop | boolean | No | `true` | Зациклити анімацію |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

Кодування AV1 повільніше за GIF чи WebP, тому інструмент зазвичай відповідає `202` і повертає завдання, за яким можна стежити через SSE за адресою `/api/v1/jobs/{jobId}/progress`. Короткий кліп може вкластися у вікно синхронного очікування й одразу повернути результат:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- Анімований AVIF не потребує ліцензійних відрахувань і за тієї ж візуальної якості зазвичай менший за анімований WebP чи GIF.
- Сучасні браузери відтворюють анімований AVIF. Деякі програми перегляду зображень для комп'ютера показують лише перший кадр.
- Звукова доріжка видаляється.
