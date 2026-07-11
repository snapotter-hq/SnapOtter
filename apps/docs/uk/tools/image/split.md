---
description: "Розділення одного зображення на плитки сітки за рядками та стовпцями або за розміром у пікселях, повертається як архів ZIP."
i18n_source_hash: 57a2e11e7cce
i18n_provenance: human
i18n_output_hash: 428b04bfeb55
---

# Розділення зображення {#image-splitting}

Розділіть одне зображення на плитки сітки за кількістю стовпців/рядків або за конкретними розмірами у пікселях. Повертає архів ZIP, що містить усі плитки.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/split`

## Параметри {#parameters}

| Параметр | Тип | Обов’язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| columns | integer | Ні | 3 | Кількість стовпців для розділення (від 1 до 100) |
| rows | integer | Ні | 3 | Кількість рядків для розділення (від 1 до 100) |
| tileWidth | integer | Ні | - | Ширина плитки у пікселях (мін. 10). Перевизначає `columns`, коли встановлено обидва `tileWidth` та `tileHeight`. |
| tileHeight | integer | Ні | - | Висота плитки у пікселях (мін. 10). Перевизначає `rows`, коли встановлено обидва `tileWidth` та `tileHeight`. |
| outputFormat | string | Ні | `"original"` | Формат виводу для плиток: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | Ні | 90 | Якість виводу для форматів зі втратами (від 1 до 100) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Приклад відповіді {#example-response}

Відповідь передається безпосередньо як файл ZIP із `Content-Type: application/zip`. Ім’я файлу відповідає шаблону `split-<jobId>.zip`.

Кожна плитка всередині ZIP має ім’я `<originalBaseName>_r<row>_c<col>.<ext>` (напр. `photo_r1_c1.png`, `photo_r2_c3.webp`).

## Примітки {#notes}

- Приймає один файл зображення.
- Підтримує вхідні формати HEIC, RAW, PSD та SVG (автоматично декодуються).
- Коли надано обидва `tileWidth` та `tileHeight`, вони мають пріоритет над `columns`/`rows`. Розміри сітки обчислюються як `ceil(imageWidth / tileWidth)` та `ceil(imageHeight / tileHeight)`.
- Крайові плитки (крайній правий стовпець, нижній рядок) можуть бути меншими за вказаний розмір плитки, якщо розміри зображення не діляться націло.
- Максимальний розмір сітки обмежено 100x100 (10 000 плиток).
- Відповідь передає ZIP безпосередньо, тому тіла відповіді JSON немає. Використовуйте `--output` з curl, щоб зберегти файл.
