---
description: "Перетворення документів Word на PDF."
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: 82292e19b738
---

# Word у PDF {#word-to-pdf}

Перетворення документів Word, тексту OpenDocument, RTF або файлів звичайного тексту на PDF.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

Приймає дані форми у форматі multipart із файлом Word/ODT/RTF/TXT.

## Параметри {#parameters}

Цей інструмент не має настроюваних параметрів. Завантажте документ, і його буде перетворено на PDF.

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
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

- Прийнятні вхідні формати: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- Перетворення виконується LibreOffice, що працює у безголовому режимі на сервері.
- За наявності використовуються шрифти, вбудовані в документ; інакше підставляються системні шрифти.
- Колонтитули, таблиці та зображення зберігаються у вихідному PDF.
