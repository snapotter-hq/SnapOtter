---
description: "Перетворення PDF на документ Word (DOCX)."
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: 0abab82913d2
---

# PDF to Word {#pdf-to-word}

Перетворюйте текстовий PDF на документ Word (DOCX). Найкраще підходить для PDF із текстом, що виділяється; скановані сторінки спочатку потребують OCR.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

Приймає багаточастинні (multipart) дані форми з файлом PDF.

## Parameters {#parameters}

Цей інструмент не має налаштовуваних параметрів. Завантажте PDF, і його буде перетворено на DOCX.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

Повертає `202 Accepted`. Відстежуйте перебіг через SSE за адресою `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Прийнятний формат вхідних даних: `.pdf`.
- Найкраще працює з текстовими PDF. Скановані сторінки або сторінки лише із зображень дадуть порожній чи мінімальний результат; використовуйте [PDF OCR](./ocr-pdf), щоб спочатку додати текстовий шар.
- Перетворення виконується LibreOffice, що працює у безголовому (headless) режимі на сервері.
- Складні розкладки (багатоколонкові, елементи, що перекриваються) можуть перетворитися неідеально.
