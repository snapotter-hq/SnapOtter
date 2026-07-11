---
description: "Конвертация изображений в base64 data URI для встраивания в HTML, CSS и другое."
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: c2f8ffaf080a
---

# Изображение в Base64 {#image-to-base64}

Конвертирует одно или несколько изображений в строки, закодированные в base64, и data URI. Поддерживает необязательную конвертацию формата, управление качеством и изменение размера. Полезно для встраивания изображений напрямую в HTML, CSS, JSON или шаблоны писем.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

Принимает данные формы multipart с одним или несколькими файлами изображений и необязательным полем JSON `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| outputFormat | string | Нет | `"original"` | Конвертировать перед кодированием: `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | Нет | `80` | Качество вывода для форматов с потерями (от 1 до 100) |
| maxWidth | number | Нет | `0` | Максимальная ширина в пикселях (0 = без изменения размера, не увеличивает) |
| maxHeight | number | Нет | `0` | Максимальная высота в пикселях (0 = без изменения размера, не увеличивает) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

Несколько файлов:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## Пример ответа {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## Поля ответа {#response-fields}

| Поле | Тип | Описание |
|-------|------|-------------|
| results | array | Успешно сконвертированные изображения |
| errors | array | Изображения, которые не удалось обработать (с именем файла и сообщением об ошибке) |

### Объект result {#result-object}

| Поле | Тип | Описание |
|-------|------|-------------|
| filename | string | Исходное имя файла |
| mimeType | string | MIME-тип закодированного вывода |
| width | number | Итоговая ширина в пикселях (после любого изменения размера) |
| height | number | Итоговая высота в пикселях (после любого изменения размера) |
| originalSize | number | Исходный размер файла в байтах |
| encodedSize | number | Размер строки base64 в байтах |
| overheadPercent | number | Процентная разница размера относительно оригинала (положительная = больше, отрицательная = меньше) |
| base64 | string | Необработанные данные изображения, закодированные в base64 |
| dataUri | string | Полный data URI, готовый к использованию в атрибутах `src` |

## Примечания {#notes}

- Кодирование base64 обычно увеличивает размер примерно на 33% по сравнению с двоичным файлом. Поле `overheadPercent` показывает фактическую разницу.
- Когда `outputFormat` равен `"original"`, файлы HEIC/HEIF конвертируются в JPEG (поскольку браузеры не могут отображать HEIC в data URI).
- Параметры `maxWidth` и `maxHeight` изменяют размер с помощью `fit: inside` с `withoutEnlargement`, поэтому изображения меньше указанных размеров не увеличиваются.
- В одном запросе можно обработать несколько файлов. Каждый файл обрабатывается независимо, и сбои не мешают успешной обработке остальных файлов.
- Файлы SVG передаются как `image/svg+xml` без перекодирования (если не запрошена конвертация формата).
- Это конечная точка только для чтения. Она не создаёт загружаемый файл или `jobId`. Данные base64 возвращаются напрямую в теле ответа.
