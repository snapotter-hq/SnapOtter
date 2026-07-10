---
description: "Перетворення PDF на архівний формат PDF/A-2 для тривалого зберігання."
i18n_source_hash: 4c6bf7a12e84
i18n_provenance: human
i18n_output_hash: 8d349af0ad83
---

# PDF/A Convert {#pdf-a-convert}

Перетворюйте PDF на архівний формат PDF/A-2, придатний для тривалого зберігання та відповідності нормативним вимогам.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

Приймає багаточастинні (multipart) дані форми з файлом PDF. Поле `settings` не потрібне.

## Parameters {#parameters}

Цей інструмент не має параметрів налаштувань. Завантажте файл PDF напряму.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notes {#notes}

- Вихідний файл відповідає стандарту PDF/A-2.
- PDF/A вбудовує всі шрифти та забороняє зовнішні посилання, тому вихідний файл може бути більшим за оригінал.
- Шифрування та JavaScript видаляються під час перетворення, оскільки вони не дозволені стандартом PDF/A.
