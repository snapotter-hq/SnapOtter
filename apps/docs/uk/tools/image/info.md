---
description: "Переглядайте детальні метадані зображення, властивості та поканальну статистику гістограми."
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: a792f2ff05e4
---

# Інформація про зображення {#image-info}

Інструмент аналізу лише для читання, що повертає вичерпні метадані зображення, зокрема розміри, формат, колірний простір, наявність EXIF/ICC/XMP та поканальну статистику гістограми. Не створює оброблений вихідний файл.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/info`

Приймає дані форми multipart з файлом зображення. Поле налаштувань не потрібне.

## Параметри {#parameters}

Цей інструмент не має параметрів, що налаштовуються. Просто завантажте файл зображення.

| Поле | Тип | Обовʼязкове | Опис |
|-------|------|----------|-------------|
| file | file | Так | Зображення для аналізу |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Приклад відповіді {#example-response}

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

## Поля відповіді {#response-fields}

| Поле | Тип | Опис |
|-------|------|-------------|
| filename | string | Очищене імʼя файлу |
| fileSize | number | Розмір файлу в байтах |
| width | number | Ширина зображення в пікселях |
| height | number | Висота зображення в пікселях |
| format | string | Виявлений формат (jpeg, png, webp тощо) |
| channels | number | Кількість колірних каналів |
| hasAlpha | boolean | Чи має зображення альфа-канал |
| colorSpace | string | Колірний простір (srgb, cmyk тощо) |
| density | number або null | Роздільна здатність DPI/PPI |
| isProgressive | boolean | Чи використовує JPEG прогресивне кодування |
| orientation | number або null | Значення орієнтації EXIF (1-8) |
| hasProfile | boolean | Чи вбудований профіль ICC |
| hasExif | boolean | Чи присутні метадані EXIF |
| hasIcc | boolean | Чи присутній колірний профіль ICC |
| hasXmp | boolean | Чи присутні метадані XMP |
| bitDepth | string або null | Бітів на семпл |
| pages | number | Кількість сторінок (для багатосторінкових форматів, як-от TIFF, GIF) |
| histogram | array | Поканальна статистика (min, max, mean, стандартне відхилення) |

## Примітки {#notes}

- Це кінцевий пункт лише для читання. Він не створює завантажуваного вихідного файлу чи `jobId`.
- Для зображень у форматі RAW (DNG, CR2, NEF, ARW тощо) ExifTool використовується для витягування істинних розмірів сенсора та прапорців метаданих, які Sharp не може прочитати напряму.
- Файли HEIC/HEIF декодуються в PNG внутрішньо для витягування піксельної статистики, оскільки Sharp не може декодувати пікселі HEVC.
- Гістограма надає min/max/mean/stdev для кожного каналу, а не повний розподіл на 256 бінів.
- Поле `density` відображає вбудовані метадані DPI, якщо вони присутні.
