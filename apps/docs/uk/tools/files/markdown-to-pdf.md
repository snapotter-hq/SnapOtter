---
description: "Перетворення файлу Markdown на стилізований PDF."
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: 73440d39b9ad
---

# Markdown у PDF {#markdown-to-pdf}

Перетворення файлу Markdown на стилізований документ PDF. З міркувань конфіденційності віддалені ресурси вимкнено.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

Приймає дані форми у форматі multipart із файлом Markdown.

## Параметри {#parameters}

Цей інструмент не має настроюваних параметрів. Завантажте файл Markdown, і його буде перетворено на PDF.

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
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

- Прийнятні вхідні формати: `.md`, `.markdown`.
- З міркувань конфіденційності та безпеки віддалені ресурси (зображення, таблиці стилів, на які посилаються через URL) не завантажуються.
- Спочатку Markdown відображається у HTML, а потім перетворюється на PDF за допомогою WeasyPrint.
- Блоки коду, таблиці та інші елементи Markdown стилізуються у вихідному PDF.
