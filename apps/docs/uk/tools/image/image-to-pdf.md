---
description: "Обʼєднайте одне або кілька зображень у документ PDF з опціями розміру сторінки, орієнтації та цільового розміру файлу."
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: 6e94bdf00179
---

# Зображення в PDF {#image-to-pdf}

Обʼєднайте одне або кілька зображень у документ PDF. Підтримує кілька розмірів сторінки, орієнтацій, полів та необовʼязкове націлювання на розмір файлу через регулювання якості.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

Приймає дані форми multipart з одним або кількома файлами зображень та полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обовʼязковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| pageSize | string | Ні | `"A4"` | Розмір сторінки: `A4`, `Letter`, `A3`, `A5` |
| orientation | string | Ні | `"portrait"` | Орієнтація сторінки: `portrait` або `landscape` |
| margin | number | Ні | `20` | Поле сторінки в пунктах (0-500) |
| targetSize | object | Ні | - | Обмеження цільового розміру файлу (див. нижче) |
| collate | boolean | Ні | `true` | Обʼєднати всі зображення в один PDF. Якщо `false`, створює один PDF на зображення. |

### Обʼєкт targetSize {#target-size-object}

| Поле | Тип | Обовʼязкове | Опис |
|-------|------|----------|-------------|
| value | number | Так | Значення цільового розміру |
| unit | string | Так | Одиниця: `KB` або `MB` |

Мінімальний цільовий розмір — 50 KB.

## Приклад запиту {#example-request}

Базовий PDF з кількома зображеннями:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

З цільовим розміром файлу:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

Один PDF на зображення:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## Приклад відповіді (обʼєднано) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## Приклад відповіді (не обʼєднано) {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## Приклад відповіді (з цільовим розміром) {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## Примітки {#notes}

- Зображення центруються на сторінці та масштабуються, щоб вміститися в межах полів зі збереженням співвідношення сторін. Зображення ніколи не збільшуються.
- Коли `collate` — `false`, кожне зображення стає окремим файлом PDF, а завантаження — це ZIP-архів, що містить усі PDF.
- Функція цільового розміру використовує ітеративний двійковий пошук за рівнями якості JPEG (10-95), щоб знайти найкращу якість, що вкладається в бюджет.
- Прозорі зображення зводяться на білий колір перед вбудовуванням у PDF.
- Підтримувані вхідні формати: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG та інші.
- Орієнтація EXIF застосовується автоматично перед вбудовуванням.
