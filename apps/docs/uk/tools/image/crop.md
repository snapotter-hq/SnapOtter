---
description: "Обрізайте зображення, вказавши область із позицією та розмірами."
i18n_source_hash: 556f37893553
i18n_provenance: human
i18n_output_hash: d8eed8736521
---

# Обрізка зображення {#crop}

Обрізайте зображення, визначивши прямокутну область за допомогою позиції та розміру. Підтримує як піксельні, так і відсоткові одиниці.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/crop`

Приймає дані форми multipart із файлом зображення та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| left | number | Yes | - | Зсув X області обрізки (від лівого краю) |
| top | number | Yes | - | Зсув Y області обрізки (від верхнього краю) |
| width | number | Yes | - | Ширина області обрізки |
| height | number | Yes | - | Висота області обрізки |
| unit | string | No | `"px"` | Одиниця для значень: `px` або `percent` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

Обрізка з використанням відсоткових значень:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- Область обрізки має вміщуватися в межах зображення. Якщо область виходить за межі зображення, запит завершиться помилкою.
- При використанні одиниці `percent` значення представляють відсотки від розмірів зображення (напр. `left: 10` означає 10% від лівого краю).
- Вихідний формат збігається з вхідним.
- Орієнтація EXIF автоматично застосовується перед обрізкою, тож координати відповідають візуально правильній орієнтації.
