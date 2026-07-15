---
description: "Разбиение одного изображения на плитки сетки по строкам и столбцам или по размеру в пикселях, возвращаемые в виде ZIP-архива."
i18n_source_hash: 838f5fa791b0
i18n_provenance: human
i18n_output_hash: 3971aad4def1
---

# Разделить изображение {#image-splitting}

Разбейте одно изображение на плитки сетки по количеству столбцов/строк или по конкретным размерам в пикселях. Возвращает ZIP-архив, содержащий все плитки.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/split`

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| columns | integer | Нет | 3 | Количество столбцов для разбиения (от 1 до 100) |
| rows | integer | Нет | 3 | Количество строк для разбиения (от 1 до 100) |
| tileWidth | integer | Нет | - | Ширина плитки в пикселях (мин. 10). Переопределяет `columns`, когда заданы и `tileWidth`, и `tileHeight`. |
| tileHeight | integer | Нет | - | Высота плитки в пикселях (мин. 10). Переопределяет `rows`, когда заданы и `tileWidth`, и `tileHeight`. |
| outputFormat | string | Нет | `"original"` | Формат вывода для плиток: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | Нет | 90 | Качество вывода для форматов с потерями (от 1 до 100) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Пример ответа {#example-response}

Ответ передаётся напрямую как ZIP-файл с `Content-Type: application/zip`. Имя файла следует шаблону `split-<jobId>.zip`.

Каждая плитка внутри ZIP именуется `<originalBaseName>_r<row>_c<col>.<ext>` (например, `photo_r1_c1.png`, `photo_r2_c3.webp`).

## Примечания {#notes}

- Принимает один файл изображения.
- Поддерживает входные форматы HEIC, RAW, PSD и SVG (автоматически декодируются).
- Когда заданы и `tileWidth`, и `tileHeight`, они имеют приоритет над `columns`/`rows`. Размеры сетки вычисляются как `ceil(imageWidth / tileWidth)` и `ceil(imageHeight / tileHeight)`.
- Краевые плитки (крайний правый столбец, нижняя строка) могут быть меньше заданного размера плитки, если размеры изображения не делятся нацело.
- Максимальный размер сетки ограничен 100x100 (10 000 плиток).
- Ответ передаёт ZIP напрямую, поэтому JSON-тела ответа нет. Используйте `--output` с curl, чтобы сохранить файл.
