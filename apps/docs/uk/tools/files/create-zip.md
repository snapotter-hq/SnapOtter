---
description: "Об'єднання кількох файлів в один архів ZIP."
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: 6715ae69a4ae
---

# Create ZIP {#create-zip}

Об'єднання кількох файлів будь-якого типу в один архів ZIP. Дублікати імен файлів автоматично усуваються.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

Приймає дані форми multipart із двома або більше файлами. Поле налаштувань не потрібне.

## Parameters {#parameters}

Цей інструмент не має налаштовуваних параметрів. Завантажте від 2 до 50 файлів будь-якого типу для об'єднання.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Потребує від 2 до 50 вхідних файлів.
- Приймається будь-який тип файлу; немає обмежень щодо вхідного формату.
- Якщо кілька файлів мають однакове ім'я, вони автоматично усуваються дублюванням із числовими суфіксами.
- Вихідний архів використовує стандартне стиснення ZIP (deflate).
