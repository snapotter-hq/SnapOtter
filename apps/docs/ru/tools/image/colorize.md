---
description: "Автоматическая раскраска чёрно-белых или полутоновых фотографий с помощью ИИ-модели DDColor."
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: cc8eaf63bac6
---

# ИИ-раскраска {#ai-colorization}

Преобразуйте чёрно-белые или полутоновые фотографии в полноцветные с помощью ИИ (модель DDColor с запасным вариантом OpenCV DNN).

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**Обработка:** Асинхронная (возвращает 202, опрашивайте `/api/v1/jobs/{jobId}/progress` для получения статуса через SSE)

**Пакет модели:** `object-eraser-colorize` (1-2 ГБ)

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| file | file | Да | - | Файл изображения (multipart) |
| intensity | number | Нет | `1.0` | Интенсивность цвета (0-1). Меньшие значения дают более сдержанную раскраску |
| model | string | Нет | `"auto"` | Используемая модель: `auto`, `ddcolor`, `opencv` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
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
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Итоговый результат (через SSE) {#final-result-via-sse}

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

## Примечания {#notes}

- Требует установки пакета модели `object-eraser-colorize` (1-2 ГБ).
- DDColor даёт результаты более высокого качества, но работает медленнее; OpenCV DNN быстрее с немного более низким качеством. `auto` использует DDColor при наличии с запасным вариантом OpenCV.
- Параметр `intensity` смешивает исходное полутоновое изображение и результат ИИ-раскраски. Используйте 1.0 для полного цвета, меньшие значения для частично обесцвеченного винтажного вида.
- Формат вывода автоматически соответствует формату ввода.
- Для выходных форматов, не поддерживающих предпросмотр в браузере, наряду с основным выводом создаётся предпросмотр WebP.
- Поддерживает входные форматы HEIC/HEIF, RAW, TGA, PSD, EXR и HDR через автоматическое декодирование.
