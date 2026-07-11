---
description: "Уменьшение размера PDF-файла за счёт сжатия встроенных изображений."
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: f57f5deacda5
---

# Compress PDF {#compress-pdf}

Уменьшите размер PDF-файла за счёт понижения разрешения встроенных изображений. Выберите между ползунком качества и целевым размером файла.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

Принимает данные multipart form с PDF-файлом и JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| mode | string | Нет | `"quality"` | Режим сжатия: `quality` или `targetSize` |
| quality | integer | Нет | `75` | Качество сжатия, 1-100 (выше = меньше сжатие). Используется в режиме `quality` |
| targetSizeKb | number | Нет | - | Целевой размер файла в килобайтах. Используется в режиме `targetSize` |

## Example Request {#example-request}

Сжатие по качеству:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Сжатие до целевого размера:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- В режиме `quality` более низкие значения дают меньшие файлы с большей потерей качества изображений.
- В режиме `targetSize` бинарный поиск находит максимальное разрешение DPI, укладывающееся в запрошенный размер.
- Если сжатие увеличило бы файл, исходные байты возвращаются без изменений.
- Текст и векторное содержимое не затрагиваются; понижается разрешение только встроенных растровых изображений.
