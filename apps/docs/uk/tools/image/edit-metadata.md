---
description: "Редагуйте поля метаданих EXIF, IPTC, GPS та XMP у зображеннях без перекодування пікселів."
i18n_source_hash: 9271d3d8f278
i18n_provenance: human
i18n_output_hash: 341ca2183b14
---

# Редагування метаданих зображення {#edit-metadata}

Редагуйте поля метаданих зображення, включно з EXIF, IPTC, координатами GPS, датами та ключовими словами. Використовує ExifTool під капотом, тож метадані записуються на місці без перекодування пікселів, зберігаючи повну якість зображення.

## API Endpoints {#api-endpoints}

### Edit Metadata {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

Записує поля метаданих у зображення та повертає змінений файл.

### Inspect Metadata {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

Повертає повні метадані із зображення через ExifTool у форматі JSON. Не змінює зображення.

## Parameters (Edit) {#parameters-edit}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | Заголовок зображення (XMP/EXIF) |
| author | string | No | - | Ім'я автора |
| artist | string | No | - | Ім'я митця (тег EXIF Artist) |
| copyright | string | No | - | Повідомлення про авторські права |
| imageDescription | string | No | - | Опис зображення (EXIF) |
| software | string | No | - | Тег програмного забезпечення |
| dateTime | string | No | - | Значення EXIF DateTime |
| dateTimeOriginal | string | No | - | Значення EXIF DateTimeOriginal |
| setAllDates | string | No | - | Встановити всі поля дат одразу |
| dateShift | string | No | - | Зсунути всі дати на зсув (формат: `+HH:MM` або `-HH:MM`) |
| clearGps | boolean | No | `false` | Видалити всі дані GPS |
| gpsLatitude | number | No | - | Встановити широту GPS (від -90 до 90) |
| gpsLongitude | number | No | - | Встановити довготу GPS (від -180 до 180) |
| gpsAltitude | number | No | - | Встановити висоту GPS у метрах |
| keywords | string[] | No | - | Ключові слова/теги для додавання або встановлення |
| keywordsMode | string | No | `"add"` | Як обробляти ключові слова: `add` (додати) або `set` (замінити) |
| fieldsToRemove | string[] | No | `[]` | Список конкретних назв полів метаданих для видалення |
| iptcTitle | string | No | - | IPTC Object Name |
| iptcHeadline | string | No | - | IPTC Headline |
| iptcCity | string | No | - | IPTC City |
| iptcState | string | No | - | IPTC Province/State |
| iptcCountry | string | No | - | IPTC Country |

## Example Request {#example-request}

Встановити автора та авторські права:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

Встановити координати GPS:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

Видалити GPS та додати ключові слова:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

Перевірити метадані:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Example Response (Edit) {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## Notes {#notes}

- Цей інструмент потребує встановлення ExifTool на сервері. Він включений у Docker-образ.
- Метадані записуються на місці, тож перекодування пікселів не відбувається. Зміна розміру файлу мінімальна (лише байти метаданих).
- Параметр `dateShift` зсуває всі поля дат на вказаний зсув, що корисно для виправлення помилок часового поясу (напр. `+02:00` або `-05:30`).
- Якщо жодних змін не запитано (всі параметри опущено або порожні), оригінальний файл повертається без змін.
- Підтримувані формати: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF.
- Для форматів, які не можна переглянути в браузері (HEIF, TIFF), відповідь містить поле `previewUrl` із попереднім переглядом WebP.
