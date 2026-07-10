---
description: "Восстановление и повышение резкости размытых или низкокачественных лиц на изображениях с помощью ИИ-моделей GFPGAN и CodeFormer."
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: 7472ebac6bc2
---

# Улучшение лиц {#face-enhancement}

Восстанавливайте и улучшайте лица на изображениях с помощью ИИ-моделей (GFPGAN/CodeFormer).

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**Обработка:** Асинхронная (возвращает 202, опрашивайте `/api/v1/jobs/{jobId}/progress` для получения статуса через SSE)

**Пакеты моделей:** `upscale-enhance` (5-6 ГБ) и `face-detection` (200-300 МБ)

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| file | file | Да | - | Файл изображения (multipart) |
| model | string | Нет | `"auto"` | Используемая модель: `auto`, `gfpgan`, `codeformer` |
| strength | number | Нет | `0.8` | Сила улучшения (0-1). Более высокие значения дают более сильное улучшение |
| onlyCenterFace | boolean | Нет | `false` | Улучшать только самое центральное/заметное лицо |
| sensitivity | number | Нет | `0.5` | Чувствительность обнаружения лиц (0-1) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
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
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Итоговый результат (через SSE) {#final-result-via-sse}

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

## Примечания {#notes}

- Требует как пакета модели `upscale-enhance` (5-6 ГБ), так и пакета модели `face-detection` (200-300 МБ).
- GFPGAN даёт более агрессивное улучшение; CodeFormer лучше сохраняет идентичность. `auto` выбирает лучшую модель для входных данных.
- Вывод всегда в формате PNG для максимального качества.
- Наряду с полноразмерным выводом создаётся предпросмотр WebP для более быстрого отображения во фронтенде.
- Параметр `strength` смешивает улучшенное лицо с оригиналом. Используйте меньшие значения (0.3-0.5) для тонких улучшений, более высокие значения (0.7-1.0) для более сильного восстановления.
- Поддерживает входные форматы HEIC/HEIF, RAW, TGA, PSD, EXR и HDR через автоматическое декодирование.
