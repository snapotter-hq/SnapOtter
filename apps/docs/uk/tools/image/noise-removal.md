---
description: "Видалення шуму та зернистості на основі ШІ з багаторівневими варіантами якості."
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: 74555af5fd4d
---

# Видалення шуму {#noise-removal}

Видалення шуму та зернистості на основі ШІ з багаторівневими варіантами якості, з використанням Python sidecar (модель SCUNet).

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**Обробка:** Асинхронна (повертає 202, опитуйте `/api/v1/jobs/{jobId}/progress` для отримання статусу через SSE)

**Пакет моделі:** `upscale-enhance` (5-6 ГБ)

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| file | file | Так | - | Файл зображення (multipart) |
| tier | string | Ні | `"balanced"` | Рівень якості: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | Ні | `50` | Сила шумозаглушення (0-100) |
| detailPreservation | number | Ні | `50` | Наскільки зберігати деталі (0-100). Вищі значення зберігають більше текстури |
| colorNoise | number | Ні | `30` | Сила зменшення кольорового шуму (0-100) |
| format | string | Ні | `"original"` | Вихідний формат: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Ні | `90` | Якість вихідного кодування (1-100) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Кінцевий результат (через SSE) {#final-result-via-sse}

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

## Примітки {#notes}

- Потребує встановлення пакета моделі `upscale-enhance` (5-6 ГБ).
- Рівні якості обмінюють швидкість на якість: `quick` найшвидший із базовим шумозаглушенням, `maximum` використовує найретельніший багатопрохідний підхід.
- Параметр `detailPreservation` критично важливий для текстурованих об'єктів (тканина, волосся, листя). Вищі значення не дають шумозаглушувачу згладжувати дрібні деталі.
- Коли `format` встановлено в `"original"`, вихідний формат збігається з форматом вхідного файлу.
- Підтримує вхідні формати HEIC/HEIF, RAW, TGA, PSD, EXR та HDR через автоматичне декодування.
