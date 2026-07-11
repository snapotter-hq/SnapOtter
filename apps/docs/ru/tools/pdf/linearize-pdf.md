---
description: "Линеаризация PDF для быстрого веб-просмотра (прогрессивная загрузка)."
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: 045906a6c1a3
---

# Web-Optimize PDF {#web-optimize-pdf}

Линеаризуйте PDF, чтобы он мог прогрессивно загружаться и отображаться в веб-браузерах, не дожидаясь полного файла.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

Принимает данные multipart form с PDF-файлом. Поле `settings` не требуется.

## Parameters {#parameters}

У этого инструмента нет параметров настроек. Загрузите PDF-файл напрямую.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- Линеаризация перестраивает внутреннюю структуру PDF так, чтобы первая страница отображалась до полной загрузки файла.
- Выходной файл может быть немного больше исходного из-за добавленных данных линеаризации.
- Уже линеаризованные PDF повторно линеаризуются без проблем.
