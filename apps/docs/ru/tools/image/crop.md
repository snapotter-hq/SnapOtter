---
description: "Обрезка изображений путём указания области с позицией и размерами."
i18n_source_hash: aab38ccd7c53
i18n_provenance: human
i18n_output_hash: e8a6b0530f47
---

# Обрезка {#crop}

Обрезайте изображения, задавая прямоугольную область с помощью позиции и размера. Поддерживает как пиксельные, так и процентные единицы.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/crop`

Принимает multipart-данные формы с файлом изображения и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| left | number | Да | - | Смещение по X области обрезки (от левого края) |
| top | number | Да | - | Смещение по Y области обрезки (от верхнего края) |
| width | number | Да | - | Ширина области обрезки |
| height | number | Да | - | Высота области обрезки |
| unit | string | Нет | `"px"` | Единица для значений: `px` или `percent` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

Обрезка с использованием процентных значений:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Примечания {#notes}

- Область обрезки должна умещаться в границах изображения. Если область выходит за пределы изображения, запрос завершится ошибкой.
- При использовании единицы `percent` значения представляют проценты от размеров изображения (например, `left: 10` означает 10% от левого края).
- Формат вывода соответствует формату ввода.
- Ориентация EXIF автоматически применяется перед обрезкой, поэтому координаты соответствуют визуально правильной ориентации.
