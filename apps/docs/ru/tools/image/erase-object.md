---
description: "Удаление нежелательных объектов с изображений с помощью ИИ-инпейнтинга (LaMa) по маске области для стирания."
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: 68b77c9da9ae
---

# Ластик объектов {#object-eraser}

Удаляйте нежелательные объекты с изображений с помощью ИИ-инпейнтинга (модель LaMa). Принимает изображение и маску, указывающую область для стирания.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**Обработка:** Асинхронная (возвращает 202, опрашивайте `/api/v1/jobs/{jobId}/progress` для получения статуса через SSE)

**Пакет модели:** `object-eraser-colorize` (1-2 ГБ)

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| file | file | Да | - | Исходный файл изображения (multipart) |
| mask | file | Да | - | Изображение маски (белый = область для стирания, чёрный = сохранить). Должно быть загружено с именем поля `mask` |
| format | string | Нет | `"auto"` | Формат вывода: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Нет | `95` | Качество вывода (1-100) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
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
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Итоговый результат (через SSE) {#final-result-via-sse}

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

## Примечания {#notes}

- Требует установки пакета модели `object-eraser-colorize` (1-2 ГБ).
- Маска должна быть тех же размеров, что и исходное изображение. Белые пиксели указывают области для стирания; ИИ заполняет их правдоподобным содержимым.
- Использует LaMa (Large Mask Inpainting) для высококачественного удаления объектов.
- Для выходных форматов, не поддерживающих предпросмотр в браузере, наряду с основным выводом создаётся предпросмотр WebP.
- Поддерживает входные форматы HEIC/HEIF, RAW, TGA, PSD, EXR и HDR через автоматическое декодирование.
