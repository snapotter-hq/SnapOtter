---
description: "Об’єднання кількох зображень в єдину сітку спрайт-аркуша з метаданими кадрів."
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: 3b0e731af8c4
---

# Спрайт-аркуш {#sprite-sheet}

Об’єднайте кілька зображень в єдину сітку спрайт-аркуша. Кожне зображення масштабується відповідно до розмірів першого зображення та розміщується в сітці. Повертає зображення спрайт-аркуша разом із метаданими координат для кожного кадру.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

Приймає багаточастинні дані форми з двома або більше файлами зображень та полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов’язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| columns | integer | Ні | `4` | Кількість стовпців у сітці (1-16) |
| padding | integer | Ні | `0` | Відступ між клітинками у пікселях (0-64) |
| background | string | Ні | `"#ffffff"` | Шістнадцятковий колір фону |
| format | string | Ні | `"png"` | Формат виводу: `png`, `webp` або `jpeg` |
| quality | integer | Ні | `90` | Якість виводу (1-100) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Примітки {#notes}

- Приймає від 2 до 64 зображень. Усі зображення масштабуються відповідно до розмірів першого завантаженого зображення.
- Масив `frames` надає точні піксельні координати кожного кадру у виводі, придатні для визначень CSS-спрайтів або карт кадрів ігрового рушія.
- Кількість рядків обчислюється автоматично з кількості зображень та значення `columns`.
- Використовуйте параметр `padding`, щоб додати проміжок між клітинками. Колір `background` видно в ділянках відступів та будь-яких порожніх кінцевих клітинках.
- Вхідні файли HEIC, RAW, PSD та SVG автоматично декодуються перед обробкою.
