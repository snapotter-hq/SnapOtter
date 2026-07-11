---
description: "Конвертація файлу HTML у PDF."
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: 592f9cad99c5
---

# HTML to PDF {#html-to-pdf}

Конвертація файлу HTML у стилізований документ PDF. Віддалені ресурси (зовнішні зображення, таблиці стилів, скрипти) вимкнено для приватності.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

Приймає дані форми multipart з файлом HTML.

## Parameters {#parameters}

Цей інструмент не має налаштовуваних параметрів. Завантажте файл HTML, і його буде конвертовано в PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
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

- Прийнятні вхідні формати: `.html`, `.htm`.
- Віддалені ресурси (зображення, таблиці стилів, скрипти, на які посилаються через URL) не завантажуються з міркувань приватності та безпеки.
- Вбудовані стилі та вбудовані зображення (data URI) зберігаються.
- Конвертація обробляється WeasyPrint на сервері.
