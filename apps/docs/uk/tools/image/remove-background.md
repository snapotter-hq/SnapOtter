---
description: "Видалення фону на основі ШІ з опціональними ефектами (розмиття, тінь, градієнт, власний фон)."
i18n_source_hash: 326a91284529
i18n_provenance: human
i18n_output_hash: f3e59f395434
---

# Видалення фону {#remove-background}

Видалення фону на основі ШІ з опціональними ефектами (розмиття, тінь, градієнт, власний фон).

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Обробка:** Асинхронна (повертає 202, опитуйте `/api/v1/jobs/{jobId}/progress` для отримання статусу через SSE)

**Пакет моделі:** `background-removal` (4-5 ГБ)

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| file | file | Так | - | Файл зображення (multipart) |
| model | string | Ні | - | Варіант моделі ШІ для використання |
| backgroundType | string | Ні | `"transparent"` | Один з: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Ні | - | Hex-код кольору для суцільного фону |
| gradientColor1 | string | Ні | - | Перший колір градієнта |
| gradientColor2 | string | Ні | - | Другий колір градієнта |
| gradientAngle | number | Ні | - | Кут градієнта в градусах |
| blurEnabled | boolean | Ні | - | Увімкнути ефект розмиття фону |
| blurIntensity | number | Ні | - | Інтенсивність розмиття (0-100) |
| shadowEnabled | boolean | Ні | - | Увімкнути падаючу тінь на об'єкті |
| shadowOpacity | number | Ні | - | Непрозорість тіні (0-100) |
| outputFormat | string | Ні | - | Вихідний формат: `png`, `webp` або `avif` |
| edgeRefine | integer | Ні | - | Рівень уточнення країв (0-3) |
| decontaminate | boolean | Ні | - | Видалити кольорові розтікання з країв |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Кінцевий результат (через SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalUrl": "/api/v1/download/{jobId}/photo_original.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## Кінцева точка ефектів (Фаза 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

Повторно застосовує фонові ефекти без повторного запуску моделі ШІ. Використовує кешовану маску та оригінал з Фази 1.

### Параметри {#parameters-1}

| Параметр | Тип | Обов'язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| settings | JSON | Так | - | JSON із налаштуваннями ефектів (див. нижче) |
| backgroundImage | file | Ні | - | Власне зображення фону (коли backgroundType дорівнює `image`) |

#### Поля JSON налаштувань {#settings-json-fields}

| Поле | Тип | Обов'язкове | Опис |
|-------|------|----------|-------------|
| jobId | string | Так | ID завдання з Фази 1 |
| filename | string | Так | Оригінальне ім'я файлу з Фази 1 |
| backgroundType | string | Ні | `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Ні | Hex-код кольору для суцільного фону |
| gradientColor1 | string | Ні | Перший колір градієнта |
| gradientColor2 | string | Ні | Другий колір градієнта |
| gradientAngle | number | Ні | Кут градієнта в градусах |
| blurEnabled | boolean | Ні | Увімкнути розмиття фону |
| blurIntensity | number | Ні | Інтенсивність розмиття (0-100) |
| shadowEnabled | boolean | Ні | Увімкнути падаючу тінь |
| shadowOpacity | number | Ні | Непрозорість тіні (0-100) |
| outputFormat | string | Ні | `png`, `webp` або `avif` |

### Приклад запиту {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Відповідь (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

## Примітки {#notes}

- Потребує встановлення пакета моделі `background-removal` (4-5 ГБ).
- Фаза 1 кешує прозору маску та оригінальне зображення, щоб Фаза 2 (ефекти) могла миттєво повторно застосовувати різні фони без повторного запуску моделі ШІ.
- Підтримує вхідні формати HEIC/HEIF, RAW, TGA, PSD, EXR та HDR через автоматичне декодування.
- Поворот EXIF автоматично коригується перед обробкою.
