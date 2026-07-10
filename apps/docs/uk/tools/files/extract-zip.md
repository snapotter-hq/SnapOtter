---
description: "Безпечне вилучення файлів з архіву ZIP із захистом від бомб."
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: f4282fb1e671
---

# Extract ZIP {#extract-zip}

Безпечне вилучення файлів з архіву ZIP. Архіви з одним файлом повертають вміщений файл безпосередньо; архіви з кількома файлами повертають плаский ZIP із вилученим вмістом.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

Приймає дані форми multipart з файлом ZIP. Поле налаштувань не потрібне.

## Parameters {#parameters}

Цей інструмент не має налаштовуваних параметрів. Завантажте файл `.zip` для вилучення.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive_extracted.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## Notes {#notes}

- Як вхідні дані приймаються лише файли `.zip`.
- Якщо архів містить один файл, цей файл повертається безпосередньо (не загорнутий у ZIP).
- Якщо архів містить кілька файлів, повертається плаский ZIP з усіма файлами, вилученими на кореневий рівень (вкладена структура каталогів вирівнюється).
- Вбудований захист від бомб відхиляє архіви з надмірними коефіцієнтами стиснення або кількістю файлів, щоб запобігти вичерпанню ресурсів.
