---
description: "Объединение одного или нескольких изображений в PDF-документ с параметрами размера страницы, ориентации и целевого размера файла."
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: a53132fbe530
---

# Изображение в PDF {#image-to-pdf}

Объединяет одно или несколько изображений в PDF-документ. Поддерживает несколько размеров страниц, ориентаций, полей и необязательное задание целевого размера файла через регулировку качества.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

Принимает данные формы multipart с одним или несколькими файлами изображений и полем JSON `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| pageSize | string | Нет | `"A4"` | Размер страницы: `A4`, `Letter`, `A3`, `A5` |
| orientation | string | Нет | `"portrait"` | Ориентация страницы: `portrait` или `landscape` |
| margin | number | Нет | `20` | Поле страницы в пунктах (0-500) |
| targetSize | object | Нет | - | Ограничение целевого размера файла (см. ниже) |
| collate | boolean | Нет | `true` | Объединить все изображения в один PDF. Если `false`, создаёт по одному PDF на изображение. |

### Объект targetSize {#target-size-object}

| Поле | Тип | Обязательный | Описание |
|-------|------|----------|-------------|
| value | number | Да | Значение целевого размера |
| unit | string | Да | Единица: `KB` или `MB` |

Минимальный целевой размер 50 КБ.

## Пример запроса {#example-request}

Базовый PDF из нескольких изображений:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

С целевым размером файла:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

По одному PDF на изображение:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## Пример ответа (объединённый) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## Пример ответа (необъединённый) {#example-response-non-collated}

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

## Пример ответа (с целевым размером) {#example-response-with-target-size}

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

## Примечания {#notes}

- Изображения центрируются на странице и масштабируются так, чтобы вписаться в поля с сохранением соотношения сторон. Изображения никогда не увеличиваются.
- Когда `collate` равен `false`, каждое изображение становится отдельным PDF-файлом, а загрузка представляет собой ZIP-архив со всеми PDF.
- Функция целевого размера использует итеративный двоичный поиск по уровням качества JPEG (10-95) для нахождения наилучшего качества, укладывающегося в заданный бюджет.
- Прозрачные изображения сводятся на белый фон перед встраиванием в PDF.
- Поддерживаемые входные форматы: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG и другие.
- Ориентация EXIF применяется автоматически перед встраиванием.
