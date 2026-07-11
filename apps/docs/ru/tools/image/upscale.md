---
description: "Увеличение изображений в 2x-4x с помощью ИИ-суперразрешения Real-ESRGAN при сохранении мелких деталей."
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: 45dd1d2767e4
---

# Увеличение изображения {#image-upscaling}

ИИ-улучшение суперразрешением с использованием Real-ESRGAN. Увеличивает изображения в 2x-4x при сохранении деталей.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**Обработка:** асинхронная (возвращает 202, опрашивайте `/api/v1/jobs/{jobId}/progress` для получения статуса через SSE)

**Пакет модели:** `upscale-enhance` (5-6 ГБ)

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| file | file | Да | - | Файл изображения (multipart) |
| scale | number | Нет | `2` | Коэффициент увеличения (например, 2, 3, 4) |
| model | string | Нет | `"auto"` | Модель для использования (например, `auto`, конкретные имена моделей) |
| faceEnhance | boolean | Нет | `false` | Применить улучшение лиц при увеличении |
| denoise | number | Нет | `0` | Сила шумоподавления (0 = выкл.) |
| format | string | Нет | `"auto"` | Формат вывода: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | Нет | `95` | Качество вывода (1-100) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
```

## Ответ {#response}

### Первоначальный ответ (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Прогресс (SSE по адресу `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Итоговый результат (через SSE) {#final-result-via-sse}

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

## Примечания {#notes}

- Требуется установка пакета модели `upscale-enhance` (5-6 ГБ).
- Использует Real-ESRGAN при наличии; переходит к интерполяции Lanczos, если ИИ-модель недоступна.
- Опция `faceEnhance` применяет восстановление лиц GFPGAN при увеличении для лучшего качества лиц.
- Для форматов вывода, не отображаемых в браузере (HEIC, JXL, TIFF), рядом с основным выводом генерируется предпросмотр WebP.
- Поддерживает входные форматы HEIC/HEIF, RAW, TGA, PSD, EXR и HDR через автоматическое декодирование.
