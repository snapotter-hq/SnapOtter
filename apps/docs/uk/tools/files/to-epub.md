---
description: "Перетворення файлів Word, Markdown, HTML або звичайного тексту на EPUB."
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: e7250f334117
---

# Перетворення на EPUB {#convert-to-epub}

Перетворення документів Word, Markdown, HTML або файлів звичайного тексту на формат електронних книг EPUB.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

Приймає дані форми у форматі multipart із файлом Word/Markdown/HTML/TXT.

## Параметри {#parameters}

Цей інструмент не має настроюваних параметрів. Завантажте документ, і його буде перетворено на EPUB.

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
```

## Приклад відповіді {#example-response}

Повертає `202 Accepted`. Відстежуйте перебіг через SSE за адресою `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Примітки {#notes}

- Прийнятні вхідні формати: `.docx`, `.md`, `.html`, `.txt`.
- Вихідні дані EPUB відповідають специфікації EPUB 3.
- Заголовки у вихідному документі використовуються для створення змісту.
- Перетворення виконується Pandoc на сервері.
