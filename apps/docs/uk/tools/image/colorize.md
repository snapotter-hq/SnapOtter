---
description: "Автоматично розфарбовуйте чорно-білі або відтінки сірого фотографії за допомогою AI-моделі DDColor."
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: 522bf26fedef
---

# AI Colorization {#ai-colorization}

Перетворюйте чорно-білі фотографії або фотографії у відтінках сірого на повнокольорові за допомогою AI (модель DDColor із резервним варіантом OpenCV DNN).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**Processing:** Асинхронна (повертає 202, опитуйте `/api/v1/jobs/{jobId}/progress` для отримання статусу через SSE)

**Model bundle:** `object-eraser-colorize` (1-2 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Файл зображення (multipart) |
| intensity | number | No | `1.0` | Інтенсивність кольору (0-1). Нижчі значення дають більш ненав'язливе розфарбовування |
| model | string | No | `"auto"` | Модель для використання: `auto`, `ddcolor`, `opencv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## Notes {#notes}

- Потрібно встановити пакет моделі `object-eraser-colorize` (1-2 GB).
- DDColor дає результати вищої якості, але працює повільніше; OpenCV DNN швидший із дещо нижчою якістю. `auto` використовує DDColor за наявності з резервним варіантом OpenCV.
- Параметр `intensity` змішує оригінал у відтінках сірого з результатом розфарбовування AI. Використовуйте 1.0 для повного кольору, нижчі значення для частково знебарвленого вінтажного вигляду.
- Вихідний формат автоматично збігається з вхідним.
- Для вихідних форматів, які не можна переглянути в браузері, поряд з основним виводом генерується попередній перегляд WebP.
- Підтримує вхідні формати HEIC/HEIF, RAW, TGA, PSD, EXR та HDR через автоматичне декодування.
