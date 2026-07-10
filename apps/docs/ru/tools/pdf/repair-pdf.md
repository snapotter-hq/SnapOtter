---
description: "Попытка восстановить повреждённый или испорченный PDF."
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: e62125ab4930
---

# Repair PDF {#repair-pdf}

Попытайтесь восстановить повреждённый или испорченный PDF, реконструировав его внутреннюю структуру.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

Принимает данные multipart form с PDF-файлом. Поле `settings` не требуется.

## Parameters {#parameters}

У этого инструмента нет параметров настроек. Загрузите повреждённый PDF-файл напрямую.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- Структурная проверка входных данных пропускается, чтобы пропустить некорректно сформированные файлы.
- Восстановление выполняется по мере возможности; сильно повреждённые файлы могут быть восстановлены не полностью.
- Восстановленный PDF может немного отличаться по размеру от исходного из-за реконструированных таблиц перекрёстных ссылок.
