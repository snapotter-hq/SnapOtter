---
description: "Лінеаризація PDF для швидкого перегляду в мережі (прогресивне завантаження)."
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: 5fc1603484f1
---

# Web-Optimize PDF {#web-optimize-pdf}

Лінеаризуйте PDF, щоб його можна було прогресивно завантажувати та відображати у веббраузерах, не чекаючи повного файлу.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

Приймає багаточастинні (multipart) дані форми з файлом PDF. Поле `settings` не потрібне.

## Parameters {#parameters}

Цей інструмент не має параметрів налаштувань. Завантажте файл PDF напряму.

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

- Лінеаризація переупорядковує внутрішню структуру PDF, щоб перша сторінка могла відобразитися до завершення завантаження всього файлу.
- Вихідний файл може бути дещо більшим за вхідний через додані дані лінеаризації.
- Уже лінеаризовані PDF повторно лінеаризуються без проблем.
