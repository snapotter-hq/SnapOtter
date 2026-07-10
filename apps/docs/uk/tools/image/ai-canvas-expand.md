---
description: "Розширення полотна зображення за допомогою ШІ-домальовування, розширюючи його в будь-якому напрямку та заповнюючи нові області відповідно до оригіналу."
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: 32d0968bfa56
---

# ШІ-розширення полотна {#ai-canvas-expand}

Розширення полотна зображення за допомогою заповнення на основі ШІ (домальовування назовні). Розширює зображення в будь-якому напрямку та заповнює нові області згенерованим ШІ вмістом, що відповідає наявному зображенню.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**Обробка:** Асинхронна (повертає 202, опитуйте `/api/v1/jobs/{jobId}/progress` щодо статусу через SSE)

**Пакет моделі:** `object-eraser-colorize` (1-2 ГБ)

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| file | file | Так | - | Файл зображення (multipart) |
| extendTop | integer | Ні | `0` | Пікселі для розширення зверху |
| extendRight | integer | Ні | `0` | Пікселі для розширення справа |
| extendBottom | integer | Ні | `0` | Пікселі для розширення знизу |
| extendLeft | integer | Ні | `0` | Пікселі для розширення зліва |
| tier | string | Ні | `"balanced"` | Рівень якості: `fast`, `balanced`, `high` |
| format | string | Ні | `"auto"` | Вихідний формат: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Ні | `95` | Якість виводу (1-100) |

Принаймні один напрямок розширення повинен бути більшим за 0.

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
```

## Відповідь {#response}

### Початкова відповідь (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Перебіг (SSE за адресою `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Кінцевий результат (через SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Примітки {#notes}

- Потребує встановлення пакета моделі `object-eraser-colorize` (1-2 ГБ).
- Використовує домальовування назовні на основі LaMa для генерації вмісту розширених областей.
- Параметр `tier` обмінює швидкість на якість: `fast` швидко дає результати з можливими артефактами, `high` триває довше, але дає плавніші, узгодженіші заповнення.
- Значення розширення вказуються в пікселях. Кінцеві розміри зображення будуть такими: початкова ширина + extendLeft + extendRight на початкову висоту + extendTop + extendBottom.
- Для вихідних форматів, які не переглядаються в браузері (HEIC, JXL, TIFF), поряд з основним виводом генерується попередній перегляд WebP.
- Підтримує вхідні формати HEIC/HEIF, RAW, TGA, PSD, EXR та HDR через автоматичне декодування.
