---
description: "Извлечение простого текста из PDF."
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: 6f9cbb151419
---

# PDF to Text {#pdf-to-text}

Извлеките весь читаемый простой текст из PDF-документа в текстовый файл.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

Принимает данные multipart form с PDF-файлом.

## Parameters {#parameters}

У этого инструмента нет настраиваемых параметров. Загрузите PDF, и его текстовое содержимое будет извлечено.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notes {#notes}

- Принимаемый входной формат: `.pdf`.
- Это быстрый (синхронный) инструмент, который возвращает результат напрямую.
- Поле `chars` в ответе указывает количество извлечённых символов.
- Извлекается только встроенный в цифровом виде текст. Для отсканированных документов или PDF на основе изображений используйте инструмент [PDF OCR](./ocr-pdf).
