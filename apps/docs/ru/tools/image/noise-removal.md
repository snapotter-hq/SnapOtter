---
description: "Удаление шума и зерна на основе ИИ с многоуровневыми вариантами качества."
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: d5660adf9706
---

# Удаление шума {#noise-removal}

Удаление шума и зерна на основе ИИ с многоуровневыми вариантами качества, использующее Python-сайдкар (модель SCUNet).

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**Обработка:** асинхронная (возвращает 202, опрашивайте `/api/v1/jobs/{jobId}/progress` для получения статуса через SSE)

**Пакет модели:** `upscale-enhance` (5-6 ГБ)

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| file | file | Да | - | Файл изображения (multipart) |
| tier | string | Нет | `"balanced"` | Уровень качества: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | Нет | `50` | Сила подавления шума (0-100) |
| detailPreservation | number | Нет | `50` | Насколько сохранять детали (0-100). Более высокие значения сохраняют больше текстуры |
| colorNoise | number | Нет | `30` | Сила подавления цветового шума (0-100) |
| format | string | Нет | `"original"` | Выходной формат: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Нет | `90` | Качество выходного кодирования (1-100) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Итоговый результат (через SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## Примечания {#notes}

- Требует установленного пакета модели `upscale-enhance` (5-6 ГБ).
- Уровни качества обменивают скорость на качество: `quick` самый быстрый с базовым шумоподавлением, `maximum` использует самый тщательный многопроходный подход.
- Параметр `detailPreservation` критичен для текстурированных объектов (ткань, волосы, листва). Более высокие значения не дают шумоподавителю сглаживать мелкие детали.
- Когда `format` установлен в `"original"`, выходной формат совпадает с форматом входного файла.
- Поддерживает входные форматы HEIC/HEIF, RAW, TGA, PSD, EXR и HDR через автоматическое декодирование.
