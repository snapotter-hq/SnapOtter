---
description: "Перетворення PDF на Markdown зі збереженням заголовків, списків і таблиць, якщо вони є в PDF."
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: 4dd15d7991d8
i18n_hash_version: 2
---

# PDF to Markdown {#pdf-to-markdown}

Перетворіть PDF на файл Markdown, який можна покласти у вікі, на статичний сайт або використати в конвеєрі для LLM.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

Приймає багаточастинні (multipart) дані форми з файлом PDF.

## Parameters {#parameters}

Цей інструмент не має налаштовуваних параметрів. Завантажте PDF, і ви отримаєте файл `.md`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

Великий PDF може оброблятися довше, ніж триває вікно синхронної відповіді. Тоді API відповідає `202` з `jobId`, а прогрес можна відстежувати за адресою `/api/v1/jobs/{jobId}/progress`.

## What gets kept {#what-gets-kept}

PDF зберігає позиціонований текст, а не структуру, тому конвертер визначає її сам:

- **Заголовки.** Короткі рядки, помітно більші за основний текст, стають заголовками від `#` до `######`, ранжованими за розміром у всьому документі.
- **Списки.** Рядки, що починаються з маркера або номера, стають елементами списку.
- **Жирний, курсив і посилання.** Зберігаються в тексті. Залишаються лише посилання `http`, `https` та `mailto`.
- **Таблиці.** Таблиці, намальовані лініями, стають таблицями Markdown. Таблиці, оформлені самими пробілами, зазвичай стають звичайними абзацами.

Зображення відкидаються. Багатоколонкові макети та незвичне оформлення сторінок обробляються за можливості, тож перевірте результат, перш ніж на нього покладатися.

## Notes {#notes}

- Прийнятний вхідний формат: `.pdf`.
- Поле `chars` у відповіді - це довжина вихідного Markdown.
- Відсканований PDF не має текстового шару для перетворення. Інструмент відхиляє його з `422` і кодом `NO_TEXT_LAYER` замість того, щоб повертати порожній файл. Для таких файлів використовуйте інструмент [PDF OCR](./ocr-pdf).
- Для зворотного перетворення [Markdown у PDF](../files/markdown-to-pdf), [Markdown у DOCX](../files/markdown-to-docx) та [Markdown у HTML](../files/markdown-to-html) читають файли `.md`.
