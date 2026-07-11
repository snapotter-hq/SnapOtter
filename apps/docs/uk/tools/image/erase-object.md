---
description: "Видаляйте небажані об'єкти із зображень за допомогою AI-домальовування (LaMa), керованого маскою області для стирання."
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: 18897977a1f9
---

# Object Eraser {#object-eraser}

Видаляйте небажані об'єкти із зображень за допомогою AI-домальовування (модель LaMa). Приймає зображення та маску, що вказує область для стирання.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**Processing:** Асинхронна (повертає 202, опитуйте `/api/v1/jobs/{jobId}/progress` для отримання статусу через SSE)

**Model bundle:** `object-eraser-colorize` (1-2 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Файл вихідного зображення (multipart) |
| mask | file | Yes | - | Зображення-маска (біле = область для стирання, чорне = зберегти). Має завантажуватися з іменем поля `mask` |
| format | string | No | `"auto"` | Вихідний формат: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | No | `95` | Якість вихідного файлу (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
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
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## Notes {#notes}

- Потрібно встановити пакет моделі `object-eraser-colorize` (1-2 GB).
- Маска має бути того самого розміру, що й вихідне зображення. Білі пікселі позначають області для стирання; AI заповнює їх правдоподібним вмістом.
- Використовує LaMa (Large Mask Inpainting) для високоякісного видалення об'єктів.
- Для вихідних форматів, які не можна переглянути в браузері, поряд з основним виводом генерується попередній перегляд WebP.
- Підтримує вхідні формати HEIC/HEIF, RAW, TGA, PSD, EXR та HDR через автоматичне декодування.
