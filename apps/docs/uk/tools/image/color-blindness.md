---
description: "Симулюйте, як зображення виглядають для людей із різними типами порушення колірного зору."
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: 73be530aa7b5
---

# Color Blindness Simulation {#color-blindness-simulation}

Симулюйте порушення колірного зору (CVD), щоб побачити, як зображення виглядають для людей із різними типами дальтонізму. Корисно для тестування доступності дизайнів, діаграм та інтерфейсів.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

Приймає дані форми multipart із файлом зображення та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| simulationType | string | No | `"deuteranomaly"` | Тип порушення колірного зору для симуляції |

### Simulation Types {#simulation-types}

| Value | Condition | Description |
|-------|-----------|-------------|
| `protanopia` | Червоносліпота | Повна відсутність червоних колбочок |
| `deuteranopia` | Зеленосліпота | Повна відсутність зелених колбочок |
| `tritanopia` | Синьосліпота | Повна відсутність синіх колбочок |
| `protanomaly` | Ослаблення червоного | Знижена чутливість червоних колбочок |
| `deuteranomaly` | Ослаблення зеленого | Знижена чутливість зелених колбочок (найпоширеніше) |
| `tritanomaly` | Ослаблення синього | Знижена чутливість синіх колбочок |
| `achromatopsia` | Повний дальтонізм | Повна відсутність колірного зору |
| `blueConeMonochromacy` | Лише синій конус | Функціонують лише сині колбочки |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## Notes {#notes}

- Дейтераномалія (ослаблення зеленого) використовується за замовчуванням, оскільки це найпоширеніша форма порушення колірного зору, що вражає приблизно 6% чоловіків.
- Симуляція використовує матриці колірного перетворення, які моделюють, як знижена або відсутня чутливість колбочок-фоторецепторів змінює сприйняття кольорів.
- Цей інструмент неруйнівний і створює лише попередній перегляд. Він не змінює оригінальне зображення для доступності.
- Вихідний формат збігається з вхідним. Вхідні дані HEIC, RAW, PSD та SVG автоматично декодуються перед обробкою.
