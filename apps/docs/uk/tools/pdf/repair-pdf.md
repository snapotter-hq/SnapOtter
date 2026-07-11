---
description: "Спроба відновити пошкоджений або зіпсований PDF."
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: df502c8dfe78
---

# Repair PDF {#repair-pdf}

Спробуйте відновити пошкоджений або зіпсований PDF, реконструюючи його внутрішню структуру.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

Приймає багаточастинні (multipart) дані форми з файлом PDF. Поле `settings` не потрібне.

## Parameters {#parameters}

Цей інструмент не має параметрів налаштувань. Завантажте пошкоджений файл PDF напряму.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- Структурна перевірка вхідних даних пропускається, щоб пропустити некоректні файли.
- Відновлення виконується за принципом найкращого зусилля; сильно пошкоджені файли можуть не відновитися повністю.
- Відновлений PDF може дещо відрізнятися за розміром від оригіналу через реконструйовані таблиці перехресних посилань.
