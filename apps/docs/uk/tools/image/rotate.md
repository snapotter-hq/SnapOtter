---
description: "Обертайте зображення на будь-який кут та відображайте по горизонталі чи вертикалі."
i18n_source_hash: af2581d7cd8d
i18n_provenance: human
i18n_output_hash: 09ffa8b2a7e5
---

# Обертання та відображення {#rotate-flip}

Обертайте зображення на довільний кут та/або відображайте їх по горизонталі чи вертикалі. Операції обертання та відображення можна поєднувати в одному запиті.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/rotate`

Приймає дані форми multipart із файлом зображення та полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| angle | number | Ні | `0` | Кут обертання в градусах (за годинниковою стрілкою). Приймає будь-яке числове значення. |
| horizontal | boolean | Ні | `false` | Відобразити зображення по горизонталі (дзеркально) |
| vertical | boolean | Ні | `false` | Відобразити зображення по вертикалі |

## Приклад запиту {#example-request}

Обернути на 90 градусів за годинниковою стрілкою:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

Відобразити по горизонталі:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

Обернути та відобразити разом:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Примітки {#notes}

- Спочатку застосовується обертання, потім операції відображення.
- Обертання не на 90 градусів (наприклад, 45 градусів) збільшать полотно, щоб вмістити обернуте зображення, із прозорою або чорною заливкою залежно від вихідного формату.
- Поширені значення: 90, 180, 270 для обертань на чверть оберту.
- Орієнтація EXIF автоматично застосовується перед обробкою, тому обертання відбувається відносно візуальної орієнтації.
