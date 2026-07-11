---
description: "Конвертація файлу Markdown у самодостатню сторінку HTML."
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: d9177db5a861
---

# Markdown to HTML {#markdown-to-html}

Конвертація файлу Markdown у самодостатню сторінку HTML. Віддалені зображення, на які посилається джерело, залишаються без змін у виводі.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

Приймає дані форми multipart з файлом Markdown.

## Parameters {#parameters}

Цей інструмент не має налаштовуваних параметрів. Завантажте файл Markdown, і його буде конвертовано в HTML.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Notes {#notes}

- Прийнятні вхідні формати: `.md`, `.markdown`.
- Це швидкий (синхронний) інструмент, який повертає результат безпосередньо.
- Вивід є самодостатньою сторінкою HTML із вбудованими стилями.
- Віддалені URL-адреси зображень у джерелі Markdown зберігаються без змін і не завантажуються.
