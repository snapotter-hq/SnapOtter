---
description: "Перетворення сторінок PDF на високоякісні зображення."
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: a2729bd3633c
---

# PDF to Image {#pdf-to-image}

Перетворюйте сторінки PDF на високоякісні растрові зображення. Підтримує вибір сторінок, кілька вихідних форматів, керування DPI та колірні режими. Включає підмаршрути info та preview для перевірки PDF перед перетворенням.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"png"` | Вихідний формат: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | No | 150 | Роздільна здатність рендерингу (від 36 до 2400). Вищий DPI дає більші, детальніші зображення. |
| quality | number | No | 85 | Якість виводу для форматів із втратами (від 1 до 100) |
| colorMode | string | No | `"color"` | Колірний режим: `color`, `grayscale`, `bw` (чорно-білий поріг) |
| pages | string | No | `"all"` | Вибір сторінок: `all`, одна сторінка (`3`), діапазон (`1-5`) або через кому (`1,3,5-8`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Info Sub-Route {#info-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/info`

Повертає кількість сторінок PDF без рендерингу жодної сторінки.

### Info Request {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Info Response {#info-response}

```json
{
  "pageCount": 10
}
```

## Preview Sub-Route {#preview-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/preview`

Повертає ескізи всіх сторінок у низькій роздільній здатності у форматі JPEG як base64 data URL. Корисно для побудови інтерфейсу вибору сторінок.

### Preview Request {#preview-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Preview Response {#preview-response}

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## Notes {#notes}

- Використовує MuPDF для рендерингу PDF, забезпечуючи високоточний вивід із коректним рендерингом шрифтів та векторної графіки.
- PDF, захищені паролем, не підтримуються та повертатимуть помилку 400.
- Параметр `pages` підтримує гнучкий синтаксис:
  - `"all"` або `""` - усі сторінки
  - `"3"` - одна сторінка
  - `"1-5"` - діапазон сторінок (включно)
  - `"1,3,5-8"` - змішані окремі сторінки та діапазони
- Номери сторінок починаються з 1. Указання сторінок за межами довжини документа повертає помилку 400.
- Основна кінцева точка завжди генерує як завантаження окремих сторінок, так і ZIP, що містить усі вибрані сторінки.
- Кінцева точка preview рендерить при 72 DPI та масштабує до ширини 300px для швидкої генерації ескізів. Ескізи мають формат JPEG з якістю 60%.
- Кінцева точка preview враховує конфігурацію сервера `MAX_PDF_PAGES`, обмежуючи кількість згенерованих ескізів.
- Для великих документів у високому DPI час опрацювання зростає пропорційно. Розгляньте використання нижчого DPI (150) для вебу та вищого DPI (300-600) для друку.
