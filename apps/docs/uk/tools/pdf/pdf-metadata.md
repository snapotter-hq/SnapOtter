---
description: "Читання та запис метаданих документа PDF."
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: c242dd695772
---

# PDF Metadata {#pdf-metadata}

Читайте та оновлюйте поля метаданих документа PDF, такі як заголовок, автор, тема та ключові слова. Коли налаштування не надано, наявні метадані повертаються без змін.

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

Усі параметри необов'язкові. Пропущені поля залишаються без змін.

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
