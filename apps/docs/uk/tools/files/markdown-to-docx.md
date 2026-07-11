---
description: "Конвертація файлу Markdown у документ Word (DOCX)."
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: 887152388e77
---

# Markdown to Word {#markdown-to-word}

Конвертація файлу Markdown у документ Word (DOCX) зі збереженням заголовків, списків, блоків коду та іншого форматування.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

Приймає дані форми multipart з файлом Markdown.

## Parameters {#parameters}

Цей інструмент не має налаштовуваних параметрів. Завантажте файл Markdown, і його буде конвертовано в DOCX.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Notes {#notes}

- Прийнятні вхідні формати: `.md`, `.markdown`.
- Це швидкий (синхронний) інструмент, який повертає результат безпосередньо.
- Заголовки, жирний текст, курсив, посилання, блоки коду та списки зіставляються зі стилями Word.
- Конвертація обробляється Pandoc на сервері.
