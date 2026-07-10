---
description: "Конвертация таблиц в PDF."
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: b23deeffc71d
---

# Excel в PDF {#excel-to-pdf}

Конвертация таблиц Excel, OpenDocument или CSV в PDF. Широкие листы могут разбиваться на несколько страниц.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

Принимает multipart form data с файлом Excel/ODS/CSV.

## Параметры {#parameters}

У этого инструмента нет настраиваемых параметров. Загрузите таблицу, и она будет конвертирована в PDF.

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
```

## Пример ответа {#example-response}

Возвращает `202 Accepted`. Отслеживайте прогресс через SSE по адресу `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Примечания {#notes}

- Принимаемые входные форматы: `.xlsx`, `.xls`, `.ods`, `.csv`.
- Широкие листы могут быть разбиты на несколько страниц в итоговом PDF.
- Диаграммы и условное форматирование отрисовываются в выводе PDF.
- Конвертация выполняется LibreOffice, работающим в безголовом режиме на сервере.
