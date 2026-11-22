---
description: "Конвертация видеоклипа в анимированное изображение AVIF."
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: 470f0877915e
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

Конвертация видеоклипа в анимированное изображение AVIF с настраиваемой частотой кадров, шириной, качеством и фрагментом клипа.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

Принимает multipart form data с файлом видео и полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Выходная частота кадров (1-30) |
| width | integer | No | `480` | Выходная ширина в пикселях (64-1280). Высота масштабируется пропорционально |
| startS | number | No | `0` | Начало фрагмента в секундах |
| durationS | number | No | `5` | Длина фрагмента в секундах (до 60) |
| quality | integer | No | `50` | Качество AVIF (1-100) |
| loop | boolean | No | `true` | Зациклить анимацию |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

Кодирование AV1 медленнее, чем GIF или WebP, поэтому инструмент обычно отвечает `202` и возвращает задачу, за которой можно следить через SSE по адресу `/api/v1/jobs/{jobId}/progress`. Короткий клип может уложиться в окно синхронного ожидания и сразу вернуть результат:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- Анимированный AVIF не требует лицензионных отчислений и при том же визуальном качестве обычно меньше анимированного WebP или GIF.
- Современные браузеры воспроизводят анимированный AVIF. Некоторые программы просмотра изображений для компьютера показывают только первый кадр.
- Звуковая дорожка удаляется.
