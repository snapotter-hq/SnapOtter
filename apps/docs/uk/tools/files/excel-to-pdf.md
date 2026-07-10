---
description: "Конвертація електронних таблиць у PDF."
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: 2f78a13254fa
---

# Excel to PDF {#excel-to-pdf}

Конвертація електронних таблиць Excel, OpenDocument або CSV у PDF. Широкі аркуші можуть розбиватися на кілька сторінок.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

Приймає дані форми multipart з файлом Excel/ODS/CSV.

## Parameters {#parameters}

Цей інструмент не має налаштовуваних параметрів. Завантажте електронну таблицю, і її буде конвертовано в PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
```

## Example Response {#example-response}

Повертає `202 Accepted`. Відстежуйте прогрес через SSE за адресою `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Прийнятні вхідні формати: `.xlsx`, `.xls`, `.ods`, `.csv`.
- Широкі аркуші можуть розбиватися на кілька сторінок у результуючому PDF.
- Діаграми та умовне форматування рендеряться у виводі PDF.
- Конвертація обробляється LibreOffice, що працює в безголовому режимі на сервері.
