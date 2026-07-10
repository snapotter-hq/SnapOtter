---
description: "Запікання форм та анотацій у вміст сторінки."
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: 001fa97bae11
---

# Flatten PDF {#flatten-pdf}

Запікайте інтерактивні поля форм та анотації у вміст сторінки, отримуючи статичний PDF, який виглядає однаково всюди.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

Приймає багаточастинні (multipart) дані форми з файлом PDF.

## Parameters {#parameters}

Цей інструмент не має налаштовуваних параметрів. Завантажте PDF, і всі форми та анотації буде запечено.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Notes {#notes}

- Прийнятний формат вхідних даних: `.pdf`.
- Це швидкий (синхронний) інструмент, який повертає результат напряму.
- Значення полів форми зберігаються як статичний текст у вихідному файлі.
- Анотації (коментарі, виділення, нотатки) стають частиною вмісту сторінки, і їх більше не можна редагувати.
