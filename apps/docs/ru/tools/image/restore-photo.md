---
description: "Устранение царапин, разрывов и повреждений на старых фотографиях с помощью ИИ-конвейера для реставрации, улучшения лиц и цвета."
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: 47db38aa13e9
---

# Реставрация фото {#photo-restoration}

Устранение царапин, разрывов и повреждений на старых фотографиях с помощью многоэтапного ИИ-конвейера. Объединяет устранение царапин, улучшение лиц, шумоподавление и опциональную колоризацию.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**Обработка:** асинхронная (возвращает 202, опрашивайте `/api/v1/jobs/{jobId}/progress` для получения статуса через SSE)

**Пакет модели:** `photo-restoration` (4-5 ГБ)

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| file | file | Да | - | Файл изображения (multipart) |
| scratchRemoval | boolean | Нет | `true` | Удалить царапины и поверхностные повреждения |
| faceEnhancement | boolean | Нет | `true` | Улучшить лица на реставрированном фото |
| fidelity | number | Нет | `0.7` | Точность улучшения лиц (0-1). Более высокие значения сильнее сохраняют исходные черты |
| denoise | boolean | Нет | `true` | Применить шумоподавление к реставрированному результату |
| denoiseStrength | number | Нет | `25` | Сила шумоподавления (0-100) |
| colorize | boolean | Нет | `false` | Колоризировать реставрированное фото (для чёрно-белых изображений) |
| colorizeStrength | number | Нет | `85` | Интенсивность колоризации (0-100) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
```

## Ответ {#response}

### Первоначальный ответ (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Прогресс (SSE на `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Итоговый результат (через SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## Примечания {#notes}

- Требует установленного пакета модели `photo-restoration` (4-5 ГБ).
- Конвейер выполняет несколько ИИ-этапов последовательно: устранение царапин, улучшение лиц (GFPGAN), шумоподавление и опционально колоризацию.
- Массив `steps` в результате показывает, какие этапы обработки были фактически выполнены.
- `scratchCoverage` — это оценочный процент площади изображения, повреждённой царапинами.
- `fidelity` управляет тем, насколько сильно улучшаются лица по сравнению с сохранением исходного вида. Более низкие значения дают более агрессивное улучшение; более высокие более консервативны.
- Опция `colorize` автоматически определяет, является ли изображение чёрно-белым. Флаг `isGrayscale` в результате подтверждает это определение.
- Выходной формат совпадает с входным автоматически.
- Поддерживает входные форматы HEIC/HEIF, RAW, TGA, PSD, EXR, HDR и AVIF через автоматическое декодирование.
