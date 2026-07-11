---
description: "Преобразование всех цветов в PDF в оттенки серого."
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: 9f9828be4de8
---

# Grayscale PDF {#grayscale-pdf}

Преобразуйте все цвета в PDF в оттенки серого, получив чёрно-белую версию документа.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

Принимает данные multipart form с PDF-файлом. Поле `settings` не требуется.

## Parameters {#parameters}

У этого инструмента нет параметров настроек. Загрузите PDF-файл напрямую.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Все цветовые пространства (RGB, CMYK) преобразуются в оттенки серого, включая встроенные изображения, векторную графику и текст.
- Выходной файл часто меньше исходного, поскольку данные в оттенках серого требуют меньше байтов на пиксель.
