---
description: "Збільшення зображень від 2x до 4x за допомогою ШІ-суперроздільності Real-ESRGAN зі збереженням дрібних деталей."
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: 4f3e6be56147
---

# Збільшення зображення {#image-upscaling}

Покращення ШІ-суперроздільності за допомогою Real-ESRGAN. Збільшує зображення в 2x-4x зі збереженням деталей.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**Обробка:** Асинхронна (повертає 202, опитуйте `/api/v1/jobs/{jobId}/progress` щодо стану через SSE)

**Пакет моделі:** `upscale-enhance` (5-6 ГБ)

## Параметри {#parameters}

| Параметр | Тип | Обов’язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| file | file | Так | - | Файл зображення (багаточастинний) |
| scale | number | Ні | `2` | Коефіцієнт збільшення (напр., 2, 3, 4) |
| model | string | Ні | `"auto"` | Модель для використання (напр., `auto`, конкретні назви моделей) |
| faceEnhance | boolean | Ні | `false` | Застосувати покращення обличчя під час збільшення |
| denoise | number | Ні | `0` | Сила придушення шуму (0 = вимкнено) |
| format | string | Ні | `"auto"` | Формат виводу: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | Ні | `95` | Якість виводу (1-100) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
```

## Відповідь {#response}

### Початкова відповідь (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Прогрес (SSE на `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Кінцевий результат (через SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## Примітки {#notes}

- Потребує встановленого пакета моделі `upscale-enhance` (5-6 ГБ).
- Використовує Real-ESRGAN, коли він доступний; повертається до інтерполяції Lanczos, якщо ШІ-модель недоступна.
- Опція `faceEnhance` застосовує відновлення обличчя GFPGAN під час збільшення для кращої якості обличчя.
- Для форматів виводу, які не можна переглянути в браузері (HEIC, JXL, TIFF), поряд з основним виводом генерується попередній перегляд WebP.
- Підтримує вхідні формати HEIC/HEIF, RAW, TGA, PSD, EXR та HDR через автоматичне декодування.
