---
description: "Уменьшение размера файла изображения по уровню качества или до целевого размера файла."
i18n_source_hash: 342c5cf1f864
i18n_provenance: human
i18n_output_hash: 6f0e13bce232
---

# Сжатие изображения {#compress}

Уменьшайте размер файла изображения, задавая уровень качества или целевой размер файла в килобайтах. Инструмент использует итеративный двоичный поиск для точного достижения целевого размера.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/compress`

Принимает multipart-данные формы с файлом изображения и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| mode | string | Нет | `"quality"` | Режим сжатия: `quality` или `targetSize` |
| quality | number | Нет | `80` | Уровень качества (1-100). Используется, когда режим равен `quality`. |
| targetSizeKb | number | Нет | - | Целевой размер файла в килобайтах. Используется, когда режим равен `targetSize`. |

## Пример запроса {#example-request}

Сжатие до качества 60:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Сжатие до целевого размера 200 КБ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Примечания {#notes}

- В режиме `quality` меньшие значения дают файлы меньшего размера с бóльшим количеством артефактов сжатия. Значение 80 является хорошим значением по умолчанию для веб-использования.
- В режиме `targetSize` движок выполняет итеративное сжатие, чтобы максимально приблизиться к целевому размеру, не превышая его.
- Формат вывода соответствует формату ввода. Сжатие применяется к нативному кодированию формата (например, качество JPEG для файлов JPEG, качество WebP для файлов WebP).
- Если качество по умолчанию (80) приемлемо, вы можете полностью опустить параметр `quality`.
