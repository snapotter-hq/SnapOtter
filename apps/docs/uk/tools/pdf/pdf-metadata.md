---
description: "Читання та запис метаданих документа PDF."
i18n_source_hash: 11de4f7991e4
i18n_provenance: machine
i18n_output_hash: 829dad7f5a3b
i18n_hash_version: 2
---

# PDF Metadata {#pdf-metadata}

Читайте та оновлюйте поля метаданих документа PDF, такі як заголовок, автор, тема та ключові слова, або повністю видаляйте метадані документа. Коли налаштування не надано, наявні метадані повертаються без змін.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Приймає багаточастинні (multipart) дані форми з файлом PDF та необов'язковим полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | Заголовок документа (макс. 500 символів) |
| author | string | No | - | Автор документа (макс. 500 символів) |
| subject | string | No | - | Тема документа (макс. 500 символів) |
| keywords | string | No | - | Ключові слова документа (макс. 500 символів) |
| stripAll | boolean | No | false | Видалити весь словник Info (дати, Creator, Producer, власні ключі), кожен потік XMP (документа, сторінок, зображень) і всі дані застосунків PieceInfo, а потім записати поля, вказані вище |
| removeAttachments | boolean | No | false | Також видалити вбудовані файли: список вкладень документа, анотації файлових вкладень і пов'язані файли (`/AF`). Потребує `stripAll` |

Усі параметри необов'язкові. Пропущені поля залишаються без змін, якщо не задано `stripAll`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Прийнятний формат вхідних даних: `.pdf`.
- Це швидкий (синхронний) інструмент, який повертає результат напряму.
- Поле `metadata` у відповіді містить підсумкові метадані після будь-яких оновлень.
- Щоб прочитати метадані без їх зміни, пропустіть поле `settings` або надішліть порожній об'єкт.
- Кожне поле метаданих обмежене 500 символами.
- З `stripAll` відповідь також містить `stripped`: ключі Info, які було видалено (`removed`), чи було видалено потік XMP документа (`xmpRemoved`), рівень PDF/A, який заявлявся у вхідному файлі (`pdfa` або `null`), скільки потоків XMP знято зі сторінок, зображень та інших об'єктів (`objectXmpRemoved`), скільки словників PieceInfo видалено (`pieceInfoRemoved`) і скільки вбудованих файлів видалено (`attachmentsRemoved`, завжди `0` без `removeAttachments`). Видалення XMP порушує відповідність PDF/A.
- `stripAll` окремо зберігає вбудовані вкладення, оскільки їх видалення змінює вміст документа. Додайте `removeAttachments`, щоб видалити й їх. Це прибирає вкладений XML з електронних рахунків ZUGFeRD і Factur-X та порушує відповідність PDF/A-3.
- Надсилання `removeAttachments` без `stripAll` повертає 400.
