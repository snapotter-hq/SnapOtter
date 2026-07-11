---
description: "Поворот изображений на любой угол и отражение по горизонтали или вертикали."
i18n_source_hash: af2581d7cd8d
i18n_provenance: human
i18n_output_hash: 8b48a012ca5a
---

# Поворот и отражение {#rotate-flip}

Поворот изображений на произвольный угол и/или их отражение по горизонтали или вертикали. Операции поворота и отражения можно объединить в одном запросе.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/image/rotate`

Принимает multipart form data с файлом изображения и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| angle | number | Нет | `0` | Угол поворота в градусах (по часовой стрелке). Принимает любое числовое значение. |
| horizontal | boolean | Нет | `false` | Отразить изображение по горизонтали (зеркально) |
| vertical | boolean | Нет | `false` | Отразить изображение по вертикали |

## Пример запроса {#example-request}

Поворот на 90 градусов по часовой стрелке:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

Отражение по горизонтали:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

Поворот и отражение вместе:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Примечания {#notes}

- Сначала применяется поворот, затем операции отражения.
- Повороты не на 90 градусов (например, 45 градусов) увеличат холст, чтобы вместить повёрнутое изображение, с прозрачной или чёрной заливкой в зависимости от выходного формата.
- Обычные значения: 90, 180, 270 для поворотов на четверть оборота.
- Ориентация по EXIF применяется автоматически перед обработкой, поэтому поворот отсчитывается относительно визуальной ориентации.
