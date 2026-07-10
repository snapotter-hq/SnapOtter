---
description: "Автоматичне покращення в один клік, що аналізує зображення та коригує експозицію, контраст, баланс білого, насиченість і різкість."
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: 063f72f648c7
---

# Покращення зображення {#image-enhancement}

Автоматичне покращення в один клік з розумним аналізом. Аналізує зображення та застосовує корекції експозиції, контрасту, балансу білого, насиченості, різкості й шумозаглушення.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**Обробка:** синхронна (використовує фабрику `createToolRoute`, повертає результат напряму)

**Пакет моделі:** не потрібен для базового покращення. Пакет `upscale-enhance` (5-6 GB) використовується лише тоді, коли увімкнено `deepEnhance` (для видалення шуму на основі ШІ через SCUNet).

## Параметри {#parameters}

| Параметр | Тип | Обовʼязковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| file | file | Так | - | Файл зображення (multipart) |
| mode | string | Ні | `"auto"` | Режим покращення: `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | Ні | `50` | Загальна інтенсивність покращення (0-100) |
| corrections | object | Ні | усі `true` | Вибіркові корекції для застосування (див. нижче) |
| deepEnhance | boolean | Ні | `false` | Увімкнути видалення шуму на основі ШІ (вимагає встановленого інструмента `noise-removal`) |

### Обʼєкт corrections {#corrections-object}

| Поле | Тип | За замовчуванням | Опис |
|-------|------|---------|-------------|
| exposure | boolean | `true` | Автокорекція експозиції |
| contrast | boolean | `true` | Автокорекція контрасту |
| whiteBalance | boolean | `true` | Автокорекція балансу білого |
| saturation | boolean | `true` | Автокорекція насиченості |
| sharpness | boolean | `true` | Автопідвищення різкості |
| denoise | boolean | `true` | Легке шумозаглушення |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## Відповідь (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Кінцевий пункт Analyze {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

Аналізує зображення та повертає рекомендації щодо корекцій, не застосовуючи їх.

### Параметри {#parameters-1}

| Параметр | Тип | Обовʼязковий | Опис |
|-----------|------|----------|-------------|
| file | file | Так | Файл зображення (multipart) |

### Приклад запиту {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### Відповідь (200 OK) {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## Примітки {#notes}

- Цей інструмент використовує синхронну фабрику `createToolRoute`, тож повертає стандартну відповідь (не асинхронну 202).
- Параметр `mode` регулює, як зважуються корекції (напр., режим портрета мʼякший до відтінків шкіри, режим пейзажу підсилює насиченість).
- Коли `deepEnhance` увімкнено та встановлено інструмент `noise-removal` (SCUNet), після стандартних корекцій застосовується додатковий прохід шумозаглушення на основі ШІ.
- Кінцевий пункт analyze корисний для попереднього перегляду того, які корекції будуть застосовані, перед підтвердженням.
- Підтримує вхідні формати HEIC/HEIF, RAW, TGA, PSD, EXR та HDR через автоматичне декодування.
