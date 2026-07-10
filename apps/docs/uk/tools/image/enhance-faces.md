---
description: "Відновлюйте та підвищуйте різкість розмитих або низькоякісних облич на зображеннях за допомогою AI-моделей GFPGAN та CodeFormer."
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: 167d4dd5e490
---

# Face Enhancement {#face-enhancement}

Відновлюйте та покращуйте обличчя на зображеннях за допомогою AI-моделей (GFPGAN/CodeFormer).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**Processing:** Асинхронна (повертає 202, опитуйте `/api/v1/jobs/{jobId}/progress` для отримання статусу через SSE)

**Model bundles:** `upscale-enhance` (5-6 GB) та `face-detection` (200-300 MB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Файл зображення (multipart) |
| model | string | No | `"auto"` | Модель для використання: `auto`, `gfpgan`, `codeformer` |
| strength | number | No | `0.8` | Сила покращення (0-1). Вищі значення дають сильніше покращення |
| onlyCenterFace | boolean | No | `false` | Покращувати лише найбільш центральне/помітне обличчя |
| sensitivity | number | No | `0.5` | Чутливість виявлення облич (0-1) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
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
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## Notes {#notes}

- Потрібні обидва пакети моделей: `upscale-enhance` (5-6 GB) та `face-detection` (200-300 MB).
- GFPGAN дає агресивніше покращення; CodeFormer краще зберігає ідентичність. `auto` обирає найкращу модель для вхідних даних.
- Вивід завжди у форматі PNG для максимальної якості.
- Поряд із виводом повної роздільної здатності генерується попередній перегляд WebP для швидшого відображення у фронтенді.
- Параметр `strength` змішує покращене обличчя з оригіналом. Використовуйте нижчі значення (0.3-0.5) для м'яких покращень, вищі значення (0.7-1.0) для сильнішого відновлення.
- Підтримує вхідні формати HEIC/HEIF, RAW, TGA, PSD, EXR та HDR через автоматичне декодування.
