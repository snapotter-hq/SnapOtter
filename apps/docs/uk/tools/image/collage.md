---
description: "Об'єднуйте кілька зображень у сіткові колажі з понад 25 шаблонами, регульованими проміжками та кутами, а також панорамуванням і масштабуванням для кожної комірки."
i18n_source_hash: cd50a782239d
i18n_provenance: human
i18n_output_hash: 263d6a539193
---

# Колаж та сітка {#collage-grid}

Об'єднуйте кілька зображень у красиві сіткові колажі з понад 25 шаблонами. Підтримуються макети з 2-9 зображень із налаштовуваними проміжком, радіусом кутів, кольором фону та панорамуванням/масштабуванням для кожної комірки.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/collage`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| templateId | string | Yes | - | ID макета шаблону (напр. `2-h-equal`, `3-left-large`, `4-grid`, `9-grid`) |
| cells | array | No | - | Масив налаштувань для кожної комірки з `imageIndex`, `panX`, `panY`, `zoom`, `objectFit` |
| cells[].imageIndex | integer | Yes | - | Індекс зображення для розміщення в цій комірці (відлік з 0) |
| cells[].panX | number | No | 0 | Горизонтальний зсув панорамування (від -100 до 100) |
| cells[].panY | number | No | 0 | Вертикальний зсув панорамування (від -100 до 100) |
| cells[].zoom | number | No | 1 | Рівень масштабування (від 1 до 10) |
| cells[].objectFit | string | No | `"cover"` | Як зображення заповнює комірку: `cover` або `contain` |
| gap | number | No | 8 | Проміжок між комірками в пікселях (від 0 до 500) |
| cornerRadius | number | No | 0 | Радіус кутів для кожної комірки в пікселях (від 0 до 500) |
| backgroundColor | string | No | `"#FFFFFF"` | Колір фону як hex або `"transparent"` |
| aspectRatio | string | No | `"free"` | Співвідношення сторін полотна: `free`, `1:1`, `4:3`, `3:2`, `16:9`, `9:16`, `4:5` |
| outputFormat | string | No | `"png"` | Вихідний формат: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | Якість вихідного файлу (від 1 до 100) |

## Available Templates {#available-templates}

| Template ID | Images | Layout |
|-------------|--------|--------|
| `2-h-equal` | 2 | Два однакові стовпці |
| `2-v-equal` | 2 | Два однакові рядки |
| `2-h-left-large` | 2 | Ліворуч 2/3, праворуч 1/3 |
| `2-h-right-large` | 2 | Ліворуч 1/3, праворуч 2/3 |
| `3-left-large` | 3 | Велике ліворуч, два стоси праворуч |
| `3-right-large` | 3 | Два стоси ліворуч, велике праворуч |
| `3-top-large` | 3 | Велике зверху, два стовпці знизу |
| `3-h-equal` | 3 | Три однакові стовпці |
| `3-v-equal` | 3 | Три однакові рядки |
| `4-grid` | 4 | Сітка 2x2 |
| `4-left-large` | 4 | Велике ліворуч, три стоси праворуч |
| `4-top-large` | 4 | Велике зверху, три стовпці знизу |
| `4-bottom-large` | 4 | Три стовпці зверху, велике знизу |
| `5-top2-bottom3` | 5 | Два зверху, три знизу |
| `5-top3-bottom2` | 5 | Три зверху, два знизу |
| `5-left-large` | 5 | Велике ліворуч, чотири стоси праворуч |
| `5-center-large` | 5 | Велике по центру, чотири кути |
| `6-grid-2x3` | 6 | 2 стовпці x 3 рядки |
| `6-grid-3x2` | 6 | 3 стовпці x 2 рядки |
| `6-top-large` | 6 | Велике зверху, п'ять стовпців знизу |
| `7-mosaic` | 7 | Мозаїчний макет |
| `8-mosaic` | 8 | Мозаїчний макет |
| `9-grid` | 9 | Сітка 3x3 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## Notes {#notes}

- Завантажте кілька файлів зображень у запиті multipart. Зображення призначаються коміркам шаблону в порядку завантаження.
- Якщо завантажено більше зображень, ніж підтримує шаблон, зайві зображення ігноруються.
- Підтримує вхідні формати HEIC, RAW, PSD та SVG (декодуються автоматично).
- Базовий розмір полотна становить 2400px по найдовшій стороні, масштабований за обраним співвідношенням сторін.
- Коли `aspectRatio` дорівнює `"free"`, полотно за замовчуванням має співвідношення 4:3 (2400x1800).
- Значення `panX`/`panY` для кожної комірки зсувають вікно обрізки в межах комірки. Значення 100 переміщує повністю до одного краю, -100 до іншого.
- Колір фону `"transparent"` зберігається лише з вихідними форматами `png`, `webp` або `avif`.
