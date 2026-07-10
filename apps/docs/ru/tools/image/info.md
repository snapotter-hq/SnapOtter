---
description: "Просмотр подробных метаданных изображения, свойств и постатейной статистики гистограммы по каналам."
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: ddfe45cbea0c
---

# Информация об изображении {#image-info}

Инструмент анализа только для чтения, возвращающий полные метаданные изображения, включая размеры, формат, цветовое пространство, наличие EXIF/ICC/XMP и постатейную статистику гистограммы по каналам. Не создаёт обработанный выходной файл.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/info`

Принимает данные формы multipart с файлом изображения. Поле настроек не требуется.

## Параметры {#parameters}

У этого инструмента нет настраиваемых параметров. Просто загрузите файл изображения.

| Поле | Тип | Обязательный | Описание |
|-------|------|----------|-------------|
| file | file | Да | Изображение для анализа |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Пример ответа {#example-response}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## Поля ответа {#response-fields}

| Поле | Тип | Описание |
|-------|------|-------------|
| filename | string | Очищенное имя файла |
| fileSize | number | Размер файла в байтах |
| width | number | Ширина изображения в пикселях |
| height | number | Высота изображения в пикселях |
| format | string | Обнаруженный формат (jpeg, png, webp и т. д.) |
| channels | number | Количество цветовых каналов |
| hasAlpha | boolean | Есть ли у изображения альфа-канал |
| colorSpace | string | Цветовое пространство (srgb, cmyk и т. д.) |
| density | number или null | Разрешение DPI/PPI |
| isProgressive | boolean | Использует ли JPEG прогрессивное кодирование |
| orientation | number или null | Значение ориентации EXIF (1-8) |
| hasProfile | boolean | Встроен ли ICC-профиль |
| hasExif | boolean | Присутствуют ли метаданные EXIF |
| hasIcc | boolean | Присутствует ли цветовой профиль ICC |
| hasXmp | boolean | Присутствуют ли метаданные XMP |
| bitDepth | string или null | Бит на выборку |
| pages | number | Количество страниц (для многостраничных форматов вроде TIFF, GIF) |
| histogram | array | Постатейная статистика (мин, макс, среднее, стандартное отклонение) |

## Примечания {#notes}

- Это конечная точка только для чтения. Она не создаёт загружаемый выходной файл или `jobId`.
- Для изображений в формате RAW (DNG, CR2, NEF, ARW и т. д.) для извлечения истинных размеров сенсора и флагов метаданных, которые Sharp не может прочитать напрямую, используется ExifTool.
- Файлы HEIC/HEIF декодируются в PNG внутренне для извлечения статистики пикселей, поскольку Sharp не может декодировать пиксели HEVC.
- Гистограмма предоставляет мин/макс/среднее/стандартное отклонение по каналу, а не полное распределение из 256 корзин.
- Поле `density` отражает встроенные метаданные DPI, если они присутствуют.
