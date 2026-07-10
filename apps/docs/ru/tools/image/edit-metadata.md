---
description: "Редактирование полей метаданных EXIF, IPTC, GPS и XMP в изображениях без повторного кодирования пикселей."
i18n_source_hash: a37746db11c3
i18n_provenance: human
i18n_output_hash: fc5a94afd201
---

# Редактирование метаданных {#edit-metadata}

Редактируйте поля метаданных изображения, включая EXIF, IPTC, координаты GPS, даты и ключевые слова. Использует ExifTool под капотом, поэтому метаданные записываются на месте без повторного кодирования пикселей, сохраняя полное качество изображения.

## Конечные точки API {#api-endpoints}

### Редактирование метаданных {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

Записывает поля метаданных в изображение и возвращает изменённый файл.

### Проверка метаданных {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

Возвращает полные метаданные из изображения через ExifTool в виде JSON. Не изменяет изображение.

## Параметры (Редактирование) {#parameters-edit}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| title | string | Нет | - | Название изображения (XMP/EXIF) |
| author | string | Нет | - | Имя автора |
| artist | string | Нет | - | Имя исполнителя (тег EXIF Artist) |
| copyright | string | Нет | - | Уведомление об авторских правах |
| imageDescription | string | Нет | - | Описание изображения (EXIF) |
| software | string | Нет | - | Тег программного обеспечения |
| dateTime | string | Нет | - | Значение EXIF DateTime |
| dateTimeOriginal | string | Нет | - | Значение EXIF DateTimeOriginal |
| setAllDates | string | Нет | - | Установить все поля дат сразу |
| dateShift | string | Нет | - | Сдвинуть все даты на смещение (формат: `+HH:MM` или `-HH:MM`) |
| clearGps | boolean | Нет | `false` | Удалить все данные GPS |
| gpsLatitude | number | Нет | - | Установить широту GPS (от -90 до 90) |
| gpsLongitude | number | Нет | - | Установить долготу GPS (от -180 до 180) |
| gpsAltitude | number | Нет | - | Установить высоту GPS в метрах |
| keywords | string[] | Нет | - | Ключевые слова/теги для добавления или установки |
| keywordsMode | string | Нет | `"add"` | Как обрабатывать ключевые слова: `add` (добавить) или `set` (заменить) |
| fieldsToRemove | string[] | Нет | `[]` | Список конкретных имён полей метаданных для удаления |
| iptcTitle | string | Нет | - | IPTC Object Name |
| iptcHeadline | string | Нет | - | IPTC Headline |
| iptcCity | string | Нет | - | IPTC City |
| iptcState | string | Нет | - | IPTC Province/State |
| iptcCountry | string | Нет | - | IPTC Country |

## Пример запроса {#example-request}

Установка автора и авторских прав:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

Установка координат GPS:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

Удаление GPS и добавление ключевых слов:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

Проверка метаданных:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Пример ответа (Редактирование) {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## Примечания {#notes}

- Этот инструмент требует установки ExifTool на сервере. Он включён в образ Docker.
- Метаданные записываются на месте, поэтому повторное кодирование пикселей не происходит. Изменение размера файла минимально (только байты метаданных).
- Параметр `dateShift` сдвигает все поля дат на указанное смещение, что полезно для исправления ошибок часового пояса (например, `+02:00` или `-05:30`).
- Если изменения не запрошены (все параметры опущены или пусты), исходный файл возвращается без изменений.
- Поддерживаемые форматы: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF.
- Для форматов, не поддерживающих предпросмотр в браузере (HEIF, TIFF), ответ включает поле `previewUrl` с предпросмотром WebP.
