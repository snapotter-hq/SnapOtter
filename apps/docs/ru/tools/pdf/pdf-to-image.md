---
description: "Преобразование страниц PDF в высококачественные изображения."
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: 926f667fefe0
---

# PDF to Image {#pdf-to-image}

Преобразуйте страницы PDF в высококачественные растровые изображения. Поддерживает выбор страниц, несколько выходных форматов, управление DPI и цветовые режимы. Включает под-маршруты info и preview для просмотра PDF перед преобразованием.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| format | string | Нет | `"png"` | Выходной формат: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | Нет | 150 | Разрешение рендеринга (от 36 до 2400). Более высокое DPI даёт более крупные и детализированные изображения. |
| quality | number | Нет | 85 | Качество вывода для форматов с потерями (от 1 до 100) |
| colorMode | string | Нет | `"color"` | Цветовой режим: `color`, `grayscale`, `bw` (порог чёрно-белого) |
| pages | string | Нет | `"all"` | Выбор страниц: `all`, одна страница (`3`), диапазон (`1-5`) или список через запятую (`1,3,5-8`) |

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

Возвращает количество страниц PDF без рендеринга каких-либо страниц.

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

Возвращает миниатюры всех страниц в низком разрешении в формате JPEG как base64-URL данных. Полезно для построения интерфейса выбора страниц.

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

- Использует MuPDF для рендеринга PDF, обеспечивая высокоточный вывод с корректным рендерингом шрифтов и векторной графики.
- PDF, защищённые паролем, не поддерживаются и вернут ошибку 400.
- Параметр `pages` поддерживает гибкий синтаксис:
  - `"all"` или `""` - все страницы
  - `"3"` - одна страница
  - `"1-5"` - диапазон страниц (включительно)
  - `"1,3,5-8"` - смешанные отдельные страницы и диапазоны
- Нумерация страниц начинается с 1. Указание страниц за пределами длины документа вернёт ошибку 400.
- Основной endpoint всегда генерирует как загрузки отдельных страниц, так и ZIP со всеми выбранными страницами.
- Endpoint preview рендерит при 72 DPI и масштабирует до ширины 300px для быстрой генерации миниатюр. Миниатюры создаются в формате JPEG с качеством 60%.
- Endpoint preview учитывает серверную конфигурацию `MAX_PDF_PAGES`, ограничивая количество генерируемых миниатюр.
- Для больших документов при высоком DPI время обработки увеличивается пропорционально. Рассмотрите использование более низкого DPI (150) для веб-использования и более высокого DPI (300-600) для печати.
