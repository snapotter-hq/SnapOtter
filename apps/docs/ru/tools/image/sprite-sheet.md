---
description: "Объединение нескольких изображений в единую сетку спрайт-листа с метаданными кадров."
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: 57c4fe20961f
---

# Спрайт-лист {#sprite-sheet}

Объедините несколько изображений в единую сетку спрайт-листа. Каждое изображение масштабируется под размеры первого изображения и размещается в сетке. Возвращает изображение спрайт-листа вместе с покадровыми метаданными координат.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

Принимает multipart form data с двумя или более файлами изображений и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| columns | integer | Нет | `4` | Количество столбцов в сетке (1-16) |
| padding | integer | Нет | `0` | Отступ между ячейками в пикселях (0-64) |
| background | string | Нет | `"#ffffff"` | Фоновый цвет в шестнадцатеричном формате |
| format | string | Нет | `"png"` | Формат вывода: `png`, `webp` или `jpeg` |
| quality | integer | Нет | `90` | Качество вывода (1-100) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Пример ответа {#example-response}

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

## Примечания {#notes}

- Принимает от 2 до 64 изображений. Все изображения масштабируются под размеры первого загруженного изображения.
- Массив `frames` предоставляет точные пиксельные координаты каждого кадра в выводе, подходящие для определений CSS-спрайтов или карт кадров игрового движка.
- Количество строк вычисляется автоматически из числа изображений и значения `columns`.
- Используйте параметр `padding`, чтобы добавить интервал между ячейками. Цвет `background` виден в областях отступов и любых пустых замыкающих ячейках.
- Входные данные HEIC, RAW, PSD и SVG автоматически декодируются перед обработкой.
