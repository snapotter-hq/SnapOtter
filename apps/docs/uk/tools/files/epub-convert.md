---
description: "Конвертація EPUB у PDF, DOCX, HTML або Markdown."
i18n_source_hash: cb39f254ff2f
i18n_provenance: human
i18n_output_hash: 57e827c75f4a
---

# Конвертація з EPUB {#convert-epub}

Конвертація електронної книги EPUB у PDF, Word (DOCX), HTML або Markdown. Віддалені ресурси всередині книги не завантажуються.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

Приймає дані форми multipart з файлом EPUB та JSON-полем `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Формат виводу: `pdf`, `docx`, `html`, `md` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
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

- Прийнятний вхідний формат: `.epub`.
- Віддалені ресурси, вбудовані в EPUB (зовнішні зображення, шрифти), не завантажуються з міркувань безпеки.
- Точність зображень у конвертованому виводі може відрізнятися залежно від структури EPUB.
- Конвертація обробляється Pandoc на сервері.
