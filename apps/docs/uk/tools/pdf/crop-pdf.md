---
description: "Обрізання всіх сторінок PDF за полями або до певної області."
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: 52a3f9618ad8
i18n_hash_version: 2
---

# Crop PDF {#crop-pdf}

Обрізайте всі сторінки PDF одним полем на кожному краї, окремим полем для кожного краю або до певної області, наприклад транспортної етикетки, надрукованої в одному куті аркуша.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Приймає багаточастинні (multipart) дані форми з файлом PDF та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `uniform` | `uniform`, `sides` або `region` |
| margin | number | No | `20` | Режим `uniform`: поле обрізки для кожного краю в пунктах (0-2000) |
| top, right, bottom, left | number | No | `0` | Режим `sides`: окреме поле обрізки для кожного краю в пунктах (0-2000) |
| x, y | number | No | `0` | Режим `region`: відступ області від лівого та верхнього країв сторінки в пунктах |
| width, height | number | No | `288`, `432` | Режим `region`: розмір області в пунктах (етикетка 4x6 in) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

Залиште лише етикетку 4x6 in у верхньому лівому куті кожної сторінки:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- Усі значення вказуються в пунктах PDF (1 пункт = 1/72 дюйма). Сторінка US Letter має 612 x 792 пунктів.
- Кожен режим читає лише власні поля, тому запит, який надсилає лише `margin`, продовжує працювати.
- Область вимірюється від верхнього лівого кута кожної сторінки й має вміщатися в кожну сторінку. Поля мають залишати частину кожної сторінки. Інакше запит завершується помилкою `400`.
- На сторінці, налаштованій для відображення з поворотом, позиції та краї стосуються сторінки в тому вигляді, в якому вона відображається, тож верхній лівий кут області є верхнім лівим кутом повернутої сторінки.
- Кожен режим вимірює від повного медіабокса, тому обрізання вже обрізаної сторінки починається з повної сторінки. Рівномірне поле `0` показує весь медіабокс.
